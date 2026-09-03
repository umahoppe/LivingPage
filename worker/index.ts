import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import type { ArticleBlock, ArticleDocument, ArticleLink } from "../src/types";
import { blocksFromPdfPages, parsePdfDate } from "./pdf-text";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
}

const MAX_HTML_BYTES = 2_000_000;
/** A PDF carries its fonts and figures inline, so the HTML budget would reject ordinary reports. */
const MAX_PDF_BYTES = 10_000_000;
/** Text extraction is the expensive part of an import; a long PDF is truncated, not refused. */
const MAX_PDF_PAGES = 60;
const MAX_REDIRECTS = 4;
/** Keep a short browsing history inside ordinary localStorage without allowing one page to fill it. */
const MAX_SNAPSHOT_CHARS = 400_000;

class ImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

export function validateImportUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ImportError("Enter a complete public article URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new ImportError("Only HTTP and HTTPS article URLs are supported.");
  if (url.username || url.password) throw new ImportError("URLs containing credentials are not supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new ImportError("Non-standard network ports are not supported.");

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost"
    || host === "0.0.0.0"
    || host === "::1"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host.startsWith("fc")
    || host.startsWith("fd")
    || host.startsWith("fe80")
    || isPrivateIpv4(host)
  ) {
    throw new ImportError("Private or local network addresses cannot be imported.");
  }
  url.hash = "";
  return url;
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function resolvePublicAsset(value: string | null | undefined, baseUrl: URL) {
  if (!value) return undefined;
  try {
    const resolved = new URL(value, baseUrl);
    return ["http:", "https:"].includes(resolved.protocol) ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function articleId(url: URL) {
  const bytes = new TextEncoder().encode(url.toString());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `article_${[...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const MAX_LINKS_PER_BLOCK = 24;

function withoutHash(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function collectTextWithLinks(root: Element, baseUrl: URL) {
  const links: ArticleLink[] = [];
  let text = "";

  const append = (value: string) => {
    let piece = value.replace(/\s+/g, " ");
    if (!piece) return;
    if (!text || text.endsWith(" ")) piece = piece.replace(/^ /, "");
    text += piece;
  };

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        append(child.nodeValue ?? "");
        continue;
      }
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (element.localName === "a") {
        const url = resolvePublicAsset(element.getAttribute("href"), baseUrl);
        const start = text.length;
        walk(element);
        const end = text.length;
        const isSamePage = url ? withoutHash(url) === withoutHash(baseUrl.toString()) : true;
        if (url && !isSamePage && end > start && links.length < MAX_LINKS_PER_BLOCK) links.push({ start, end, url });
        continue;
      }
      walk(element);
    }
  };

  walk(root);
  const trimmed = text.trimEnd();
  const scoped = links
    .map((link) => ({ ...link, end: Math.min(link.end, trimmed.length) }))
    .filter((link) => link.end > link.start && trimmed.slice(link.start, link.end).trim().length > 0);
  return { text: trimmed, links: scoped };
}

function applyDocumentBase(document: Document, sourceUrl: URL): URL {
  const existing = document.querySelector("base[href]");
  const declared = resolvePublicAsset(existing?.getAttribute("href"), sourceUrl);
  const resolved = declared ? new URL(declared) : sourceUrl;
  if (existing) {
    existing.setAttribute("href", resolved.toString());
    return resolved;
  }
  const base = document.createElement("base");
  base.setAttribute("href", resolved.toString());
  const head = document.querySelector("head") ?? document.documentElement;
  head?.insertBefore(base, head.firstChild);
  return resolved;
}

function extractBlocks(document: Document, baseUrl: URL): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const element of document.querySelectorAll("h2, h3, p, blockquote, li")) {
    const { text, links } = collectTextWithLinks(element as unknown as Element, baseUrl);
    const isHeading = element.localName === "h2" || element.localName === "h3";
    if ((isHeading && text.length < 3) || (!isHeading && text.length < 35) || text.length > 1_800) continue;
    const signature = text.toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    blocks.push({
      id: `imported-${index++}`,
      kind: isHeading ? "h2" : element.localName === "blockquote" ? "quote" : "p",
      text,
      ...(links.length ? { links } : {}),
    });
    element.setAttribute("data-rg-block-id", blocks[blocks.length - 1].id);
    if (blocks.length >= 80) break;
  }
  return blocks;
}

const SNAPSHOT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "style-src 'unsafe-inline' https:",
  "img-src https: data:",
  "font-src https: data:",
  "media-src https:",
].join("; ");

const SNAPSHOT_STYLE = `
html { color-scheme: light; background: #fff; }
body { margin: 0; padding: clamp(28px, 5vw, 72px); color: #20241f; background: #fff; }
img, picture, video { max-width: 100%; height: auto; }
a { cursor: pointer; }
[data-rg-block-id] { position: relative; }
::highlight(rg-anchors) { background: rgba(244, 205, 91, .42); text-decoration: underline; text-decoration-color: #9b7830; text-underline-offset: 3px; }
::highlight(rg-search) { background: #ffd75e; color: #171a17; }
.rg-injected { box-sizing: border-box; font-family: system-ui, sans-serif; }
.rg-anchor-rail { float: right; display: inline-flex; gap: 4px; margin: 2px 0 4px 10px; }
.rg-anchor-count { width: 24px; height: 24px; border: 1px solid #8daf98; border-radius: 999px; padding: 0; background: #e4f1e7; color: #28573a; box-shadow: 0 2px 7px rgba(36,79,52,.16); font: 700 10px/1 system-ui, sans-serif; cursor: pointer; }
.rg-anchor-count:hover, .rg-anchor-count:focus-visible { background: #315f42; color: #fff; outline: 2px solid rgba(49,95,66,.22); outline-offset: 2px; }
.rg-inline-layer { clear: both; margin: 10px 0 18px; border: 1px solid #cbd9ce; border-left: 3px solid #4f8060; border-radius: 9px; padding: 10px 12px; background: #f4f8f4; color: #34443a; font: 13px/1.55 system-ui, sans-serif; }
.rg-inline-layer strong { display: block; margin-bottom: 4px; font-size: 12px; }
.rg-inline-layer p { margin: 0; font: inherit; color: inherit; }
.rg-document-title { margin: 0 0 .8em; font: 700 clamp(32px, 5vw, 58px)/1.08 Georgia, serif; letter-spacing: -.025em; }
.rg-inline-images { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 8px; }
.rg-inline-images figure { margin: 0; }
.rg-inline-images img { display: block; width: 100%; max-height: 260px; object-fit: cover; border-radius: 7px; }
.rg-inline-images figcaption, .rg-inline-sources { display: block; margin-top: 5px; font: 11px/1.4 system-ui, sans-serif; }
.rg-inline-sources a { margin-right: 8px; color: #315c40; }
`;

function safeSnapshotStyles(source: Document, target: Document, baseUrl: URL) {
  for (const stylesheet of Array.from(source.querySelectorAll('link[rel~="stylesheet"][href]')).slice(0, 16)) {
    const href = resolvePublicAsset(stylesheet.getAttribute("href"), baseUrl);
    if (!href?.startsWith("https://")) continue;
    const link = target.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", href);
    link.setAttribute("referrerpolicy", "no-referrer");
    target.head.appendChild(link);
  }
  for (const original of Array.from(source.querySelectorAll("style")).slice(0, 24)) {
    const style = target.createElement("style");
    style.textContent = original.textContent ?? "";
    target.head.appendChild(style);
  }
}

function sanitizeSnapshot(document: Document, sourceDocument: Document, baseUrl: URL, title: string) {
  if (!document.body.querySelector("h1")) {
    const originalTitle = sourceDocument.querySelector("h1")?.cloneNode(true) as Element | undefined;
    if (originalTitle) document.body.prepend(originalTitle);
    else {
      const heading = document.createElement("h1");
      heading.className = "rg-document-title";
      heading.textContent = title;
      document.body.prepend(heading);
    }
  }
  for (const element of Array.from(document.querySelectorAll(
    "script, iframe, frame, frameset, object, embed, form, input, textarea, select, option, button, meta, base, template, portal, noscript, canvas",
  ))) element.remove();

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || ["srcdoc", "formaction", "autofocus", "contenteditable", "download"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.localName === "a") {
      const href = element.getAttribute("href");
      if (href?.startsWith("#")) {
        element.setAttribute("href", href);
      } else {
        const safe = resolvePublicAsset(href, baseUrl);
        if (safe) element.setAttribute("href", safe);
        else element.removeAttribute("href");
      }
      element.setAttribute("target", "_self");
      element.setAttribute("rel", "noreferrer nofollow");
    }
  }

  document.documentElement.setAttribute("lang", sourceDocument.documentElement.getAttribute("lang") || "en");
  document.body.className = `${sourceDocument.body?.className ?? ""} rg-snapshot`.trim();
  if (sourceDocument.body?.id) document.body.id = sourceDocument.body.id;
  document.head.replaceChildren();
  const meta = document.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", SNAPSHOT_CSP);
  document.head.appendChild(meta);
  const referrer = document.createElement("meta");
  referrer.setAttribute("name", "referrer");
  referrer.setAttribute("content", "no-referrer");
  document.head.appendChild(referrer);
  const titleNode = document.createElement("title");
  titleNode.textContent = title;
  document.head.appendChild(titleNode);
  safeSnapshotStyles(sourceDocument, document, baseUrl);
  const snapshotStyle = document.createElement("style");
  snapshotStyle.textContent = SNAPSHOT_STYLE;
  document.head.appendChild(snapshotStyle);
  const html = document.toString();
  return html.length <= MAX_SNAPSHOT_CHARS ? html : undefined;
}

export async function extractArticle(html: string, sourceUrl: URL): Promise<ArticleDocument> {
  const { document } = parseHTML(html);
  const baseUrl = applyDocumentBase(document as unknown as Document, sourceUrl);
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content");
  const siteName = cleanText(meta('meta[property="og:site_name"]')) || sourceUrl.hostname.replace(/^www\./, "");
  const publishedAt = meta('meta[property="article:published_time"]')
    || document.querySelector("time[datetime]")?.getAttribute("datetime")
    || undefined;
  const originalHero = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');

  const parsed = new Readability(document as unknown as Document, {
    charThreshold: 240,
    keepClasses: true,
  }).parse();
  if (!parsed?.content || !parsed.textContent) throw new ImportError("We could not identify a readable article on this page.", 422);

  // linkedom treats a lone Readability root <div> as documentElement. Give it a real document
  // shell so security-sensitive <meta> policy stays inside <head> after serialization.
  const { document: contentDocument } = parseHTML(`<!doctype html><html><head></head><body>${parsed.content}</body></html>`);
  let blocks = extractBlocks(contentDocument as unknown as Document, baseUrl);
  if (blocks.length < 2) {
    const fallback = parsed.textContent
      .split(/\n{2,}/)
      .map(cleanText)
      .filter((text) => text.length >= 35 && text.length <= 1_800)
      .slice(0, 80)
      .map((text, index) => ({ id: `imported-${index}`, kind: "p" as const, text }));
    if (fallback.length >= 2) blocks = fallback;
  }
  if (blocks.length < 2) throw new ImportError("The page did not contain enough readable article text.", 422);

  const contentImage = contentDocument.querySelector("img")?.getAttribute("src");
  const snapshotHtml = sanitizeSnapshot(
    contentDocument as unknown as Document,
    document as unknown as Document,
    baseUrl,
    cleanText(parsed.title) || cleanText(document.title) || "Imported article",
  );
  return {
    id: await articleId(sourceUrl),
    title: cleanText(parsed.title) || cleanText(document.title) || "Imported article",
    deck: cleanText(parsed.excerpt) || cleanText(blocks.find((block) => block.kind === "p")?.text).slice(0, 280),
    author: cleanText(parsed.byline) || cleanText(meta('meta[name="author"]')) || "Unknown author",
    publishedAt,
    sourceUrl: sourceUrl.toString(),
    siteName,
    heroImageUrl: resolvePublicAsset(originalHero || contentImage, baseUrl),
    importedAt: new Date().toISOString(),
    snapshotHtml,
    blocks,
  };
}

async function readLimitedBytes(response: Response, limit: number, tooLarge: string) {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > limit) throw new ImportError(tooLarge, 413);
  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ImportError(tooLarge, 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

type FetchedSource =
  | { kind: "html"; html: string; finalUrl: URL }
  | { kind: "pdf"; bytes: Uint8Array; finalUrl: URL };

async function fetchPublicPage(initialUrl: URL): Promise<FetchedSource> {
  let current = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "text/html,application/xhtml+xml,application/pdf",
        "user-agent": "LivingPage/0.1 (+https://webmcp.devpost.com)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new ImportError("The article redirected without a destination.", 502);
      current = validateImportUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new ImportError(`The article server returned ${response.status}.`, 502);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/pdf")) {
      const bytes = await readLimitedBytes(response, MAX_PDF_BYTES, "This PDF is too large to import.");
      return { kind: "pdf", bytes, finalUrl: current };
    }
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new ImportError("This URL is not an HTML article or a PDF.", 415);
    }
    const bytes = await readLimitedBytes(response, MAX_HTML_BYTES, "This page is too large to import.");
    return { kind: "html", html: new TextDecoder().decode(bytes), finalUrl: current };
  }
  throw new ImportError("The article redirected too many times.", 502);
}

function filenameTitle(sourceUrl: URL) {
  const name = decodeURIComponent(sourceUrl.pathname.split("/").pop() ?? "").replace(/\.pdf$/i, "");
  return cleanText(name.replace(/[_-]+/g, " "));
}

/**
 * A PDF becomes the same `ArticleDocument` an HTML import produces, so anchoring, layers,
 * the queue, and every canvas keep working unchanged. What it cannot carry is markup: there
 * are no in-text links to follow and no hero image, and a two-column or heavily tabular
 * layout will read out of order because the page geometry is all the file records.
 */
export async function extractPdfArticle(bytes: Uint8Array, sourceUrl: URL): Promise<ArticleDocument> {
  let pages: string[];
  let info: Record<string, unknown>;
  try {
    // One proxy for both reads: the parser takes ownership of the byte array it is handed,
    // so passing the same buffer twice leaves the second call reading a detached buffer.
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: false });
    pages = extracted.text.slice(0, MAX_PDF_PAGES);
    info = (await getMeta(pdf)).info ?? {};
  } catch {
    throw new ImportError("This PDF could not be read. It may be encrypted or damaged.", 422);
  }

  const blocks = blocksFromPdfPages(pages);
  // A scanned PDF parses perfectly and yields nothing: say so rather than importing a blank article.
  if (!pages.join("").replace(/\s/g, "")) {
    throw new ImportError("This PDF has no text layer — it looks like a scan, and text recognition is not available here.", 422);
  }
  if (blocks.length < 2) throw new ImportError("The PDF did not contain enough readable article text.", 422);

  const title = cleanText(typeof info.Title === "string" ? info.Title : "")
    || filenameTitle(sourceUrl)
    || blocks.find((block) => block.kind === "h2")?.text
    || "Imported PDF";
  const author = cleanText(typeof info.Author === "string" ? info.Author : "") || "Unknown author";

  return {
    id: await articleId(sourceUrl),
    title,
    deck: cleanText(blocks.find((block) => block.kind === "p")?.text).slice(0, 280),
    author,
    publishedAt: parsePdfDate(info.CreationDate) ?? parsePdfDate(info.ModDate),
    sourceUrl: sourceUrl.toString(),
    siteName: sourceUrl.hostname.replace(/^www\./, ""),
    importedAt: new Date().toISOString(),
    blocks,
  };
}

async function handleImport(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json() as { url?: unknown };
  } catch {
    throw new ImportError("Send the article URL as JSON.");
  }
  if (typeof body.url !== "string" || body.url.length > 2_048) throw new ImportError("Enter a valid public article URL.");
  const requestedUrl = validateImportUrl(body.url);
  const source = await fetchPublicPage(requestedUrl);
  return source.kind === "pdf"
    ? extractPdfArticle(source.bytes, source.finalUrl)
    : extractArticle(source.html, source.finalUrl);
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/api/import") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      try {
        return json({ article: await handleImport(request) });
      } catch (error) {
        if (error instanceof ImportError) return json({ error: error.message }, error.status);
        if (error instanceof Error && error.name === "TimeoutError") return json({ error: "The article took too long to respond." }, 504);
        console.error("Article import failed", error);
        return json({ error: "The article could not be imported." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
