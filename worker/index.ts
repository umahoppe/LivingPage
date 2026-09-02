import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ArticleBlock, ArticleDocument, ArticleLink } from "../src/types";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
}

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;

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

function extractBlocks(content: string, baseUrl: URL): ArticleBlock[] {
  const { document } = parseHTML(content);
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
    if (blocks.length >= 80) break;
  }
  return blocks;
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
    keepClasses: false,
  }).parse();
  if (!parsed?.content || !parsed.textContent) throw new ImportError("We could not identify a readable article on this page.", 422);

  let blocks = extractBlocks(parsed.content, baseUrl);
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

  const { document: contentDocument } = parseHTML(parsed.content);
  const contentImage = contentDocument.querySelector("img")?.getAttribute("src");
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
    blocks,
  };
}

async function readLimitedHtml(response: Response) {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_HTML_BYTES) throw new ImportError("This page is too large to import.", 413);
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new ImportError("This page is too large to import.", 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchPublicPage(initialUrl: URL) {
  let current = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "ResearchGarden/0.1 (+https://webmcp.devpost.com)",
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
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new ImportError("This URL is not an HTML article.", 415);
    }
    return { html: await readLimitedHtml(response), finalUrl: current };
  }
  throw new ImportError("The article redirected too many times.", 502);
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
  const { html, finalUrl } = await fetchPublicPage(requestedUrl);
  return extractArticle(html, finalUrl);
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
