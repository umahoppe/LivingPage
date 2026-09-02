import type { ArticleBlock } from "../src/types";

/**
 * A PDF has no paragraphs — it has lines placed on a page. Rebuilding readable blocks from
 * those lines is the whole of PDF import, and it is a heuristic: everything here is a guess
 * about typography that the HTML path gets told outright by the markup.
 */

/** Same floors as the HTML path, so a heading is allowed to be short and a paragraph is not. */
const MIN_PARAGRAPH_CHARACTERS = 35;
const MIN_HEADING_CHARACTERS = 3;
const MAX_BLOCK_CHARACTERS = 1_800;
const MAX_BLOCKS = 80;
/** Above this a line is body text that happened to wrap, not a title. */
const MAX_HEADING_CHARACTERS = 90;
/** A line this much shorter than the column it sits in has ended its paragraph. */
const SHORT_LINE_RATIO = 0.8;

/** Running heads and folios repeat; body text does not. */
const MIN_REPEATS_FOR_FURNITURE = 3;

const PAGE_NUMBER = /^(?:[ivxlcdm]+|\d{1,4}|[-–—[(]?\s*\d{1,4}\s*[-–—\])]?|page\s+\d{1,4}(?:\s+of\s+\d{1,4})?)$/i;
const SENTENCE_END = /[.!?"”’)\]]$/;
const HEADING_STOP = /[.,;:!?]$/;
const NUMBERED_HEADING = /^(?:\d+(?:\.\d+)*\.?|[A-Z]\.|[ivxlcdm]+\.)\s+\S/i;

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Lines that appear identically on several pages are running heads, folios, or footers.
 * Dropping them by repetition avoids guessing at page geometry we do not have here.
 */
function furnitureLines(pages: string[]) {
  if (pages.length < MIN_REPEATS_FOR_FURNITURE) return new Set<string>();
  const pageCounts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const line of page.split("\n")) {
      const key = collapse(line).toLowerCase();
      if (!key || key.length > 120) continue;
      seen.add(key);
    }
    for (const key of seen) pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(MIN_REPEATS_FOR_FURNITURE, Math.ceil(pages.length * 0.5));
  return new Set([...pageCounts].filter(([, count]) => count >= threshold).map(([key]) => key));
}

function readableLines(pages: string[]) {
  const furniture = furnitureLines(pages);
  const lines: Array<string | undefined> = [];
  for (const page of pages.slice(0, MAX_BLOCKS)) {
    for (const raw of page.split("\n")) {
      const line = collapse(raw);
      if (!line) {
        // A blank line is a paragraph boundary the document gave us; keep it as one.
        if (lines.length && lines[lines.length - 1] !== undefined) lines.push(undefined);
        continue;
      }
      if (PAGE_NUMBER.test(line)) continue;
      if (furniture.has(line.toLowerCase())) continue;
      lines.push(line);
    }
    if (lines.length && lines[lines.length - 1] !== undefined) lines.push(undefined);
  }
  return lines;
}

/**
 * Joining a wrapped line: a word broken across lines loses its hyphen, and everything else
 * gains the space the line break stood for.
 */
function joinWrapped(current: string, next: string) {
  if (/[\p{Ll}\p{N}]-$/u.test(current) && /^[\p{Ll}]/u.test(next)) return current.slice(0, -1) + next;
  return `${current} ${next}`;
}

/** A heading is short, unpunctuated, and standing on its own. */
function looksLikeHeading(text: string, lineCount: number) {
  if (lineCount > 1) return false;
  if (text.length < MIN_HEADING_CHARACTERS || text.length > MAX_HEADING_CHARACTERS) return false;
  if (HEADING_STOP.test(text)) return false;
  if (NUMBERED_HEADING.test(text)) return true;
  if (text === text.toUpperCase() && /\p{L}/u.test(text)) return true;
  // Title case: most words capitalised, and no sentence-like length.
  const words = text.split(" ").filter((word) => /\p{L}/u.test(word));
  if (words.length < 2 || words.length > 12) return false;
  const capitalised = words.filter((word) => /^[\p{Lu}\p{N}]/u.test(word)).length;
  return capitalised / words.length >= 0.6;
}

interface Paragraph {
  text: string;
  lineCount: number;
}

function paragraphsFromLines(lines: Array<string | undefined>): Paragraph[] {
  const bodyLines = lines.filter((line): line is string => line !== undefined);
  // The typical full line in this document; anything much shorter ended its paragraph.
  const longest = bodyLines.reduce((max, line) => Math.max(max, line.length), 0);
  const wrapWidth = longest * SHORT_LINE_RATIO;

  const paragraphs: Paragraph[] = [];
  let current: string | undefined;
  let lineCount = 0;

  const flush = () => {
    if (current) paragraphs.push({ text: current, lineCount });
    current = undefined;
    lineCount = 0;
  };

  for (const line of lines) {
    if (line === undefined) {
      flush();
      continue;
    }
    // A heading is followed straight by its body, with no blank line to separate them, so it
    // has to be recognised as it starts a paragraph or it is swallowed by the text beneath it.
    if (current === undefined && line.length < wrapWidth && looksLikeHeading(line, 1)) {
      paragraphs.push({ text: line, lineCount: 1 });
      continue;
    }
    if (current === undefined) {
      current = line;
      lineCount = 1;
    } else {
      current = joinWrapped(current, line);
      lineCount += 1;
    }
    // A line that stops short of the column width has nothing following it on that line,
    // so a sentence ending there ends the paragraph too.
    if (line.length < wrapWidth && SENTENCE_END.test(line)) flush();
  }
  flush();
  return paragraphs;
}

/**
 * Rebuilds addressable article blocks from per-page PDF text. Anchoring, layers, and the
 * canvases all work off block text and offsets, so once a PDF reaches this shape the rest
 * of the page treats it exactly like an imported HTML article.
 */
export function blocksFromPdfPages(pages: string[]): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const paragraph of paragraphsFromLines(readableLines(pages))) {
    const text = paragraph.text;
    if (text.length > MAX_BLOCK_CHARACTERS) continue;
    const isHeading = looksLikeHeading(text, paragraph.lineCount);
    if (isHeading ? text.length < MIN_HEADING_CHARACTERS : text.length < MIN_PARAGRAPH_CHARACTERS) continue;
    const signature = text.toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    blocks.push({ id: `imported-${index++}`, kind: isHeading ? "h2" : "p", text });
    if (blocks.length >= MAX_BLOCKS) break;
  }
  return blocks;
}

/** PDF date strings look like `D:20260901120000+09'00'`. */
export function parsePdfDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00"] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export const PDF_LIMITS = { MAX_BLOCKS, MAX_PARAGRAPH_CHARACTERS: MAX_BLOCK_CHARACTERS };
