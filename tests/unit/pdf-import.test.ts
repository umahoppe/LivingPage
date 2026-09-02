import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { extractPdfArticle } from "../../worker/index";
import { blocksFromPdfPages, parsePdfDate } from "../../worker/pdf-text";
import { buildTestPdf } from "./pdf-fixture";

const reportPages = [
  [
    "Curb Space Allocation Review",
    "1  Introduction",
    "Cities are re-examining how the curb is allocated between deliveries,",
    "buses, bicycles, trees, and places for people to meet each other.",
    "Confidential draft",
    "1",
  ],
  [
    "Curb Space Allocation Review",
    "The reallocation is rarely a single decision. It accumulates from park-",
    "ing rules, loading permits, and bus lane hours set by separate offices.",
    "Confidential draft",
    "2",
  ],
  [
    "Curb Space Allocation Review",
    "2  Findings",
    "Measured across twelve corridors, delivery dwell time fell where loading",
    "zones were formalised and rose where they were removed entirely.",
    "Confidential draft",
    "3",
  ],
];

describe("PDF block reconstruction", () => {
  it("rebuilds wrapped lines into paragraphs and keeps short headings", () => {
    const blocks = blocksFromPdfPages(reportPages.map((page) => page.join("\n")));

    // Wrapped lines become one paragraph, and a word broken across lines loses its hyphen.
    const body = blocks.filter((block) => block.kind === "p").map((block) => block.text);
    expect(body.some((text) => text.includes("between deliveries, buses, bicycles"))).toBe(true);
    expect(body.some((text) => text.includes("parking rules, loading permits"))).toBe(true);
    expect(body.join(" ")).not.toContain("park- ing");

    // A numbered section heading survives the paragraph floor that would drop it as body text.
    const headings = blocks.filter((block) => block.kind === "h2").map((block) => block.text);
    expect(headings).toContain("1 Introduction");
    expect(headings).toContain("2 Findings");

    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length);
  });

  it("drops running heads and page numbers rather than anchoring them", () => {
    const text = blocksFromPdfPages(reportPages.map((page) => page.join("\n"))).map((block) => block.text);
    expect(text).not.toContain("Curb Space Allocation Review");
    expect(text.some((value) => value === "Confidential draft")).toBe(false);
    expect(text.some((value) => /^\d+$/.test(value))).toBe(false);
  });

  it("reads PDF date strings and refuses values that are not dates", () => {
    expect(parsePdfDate("D:20260831120000Z")).toBe("2026-08-31T12:00:00.000Z");
    expect(parsePdfDate("D:20260831")).toBe("2026-08-31T00:00:00.000Z");
    expect(parsePdfDate("last Tuesday")).toBeUndefined();
    expect(parsePdfDate(undefined)).toBeUndefined();
  });
});

describe("PDF article import", () => {
  const sourceUrl = new URL("https://city.example/reports/curb-space-review.pdf");

  it("produces the same article shape an HTML import produces", async () => {
    const pdf = buildTestPdf(reportPages, {
      Title: "Curb Space Allocation Review",
      Author: "Mina Ortega",
      CreationDate: "D:20260831120000Z",
    });
    const article = await extractPdfArticle(pdf, sourceUrl);

    expect(article.title).toBe("Curb Space Allocation Review");
    expect(article.author).toBe("Mina Ortega");
    expect(article.publishedAt).toBe("2026-08-31T12:00:00.000Z");
    expect(article.siteName).toBe("city.example");
    expect(article.sourceUrl).toBe(sourceUrl.toString());
    expect(article.blocks.length).toBeGreaterThanOrEqual(3);
    expect(article.deck.length).toBeGreaterThan(0);
    // No markup means no links to follow and no hero image to show.
    expect(article.heroImageUrl).toBeUndefined();
    expect(article.blocks.every((block) => block.links === undefined)).toBe(true);
  });

  it("falls back to the filename when the PDF declares no title", async () => {
    const article = await extractPdfArticle(buildTestPdf(reportPages), sourceUrl);
    expect(article.title).toBe("curb space review");
    expect(article.author).toBe("Unknown author");
  });

  it("refuses a PDF with no text layer instead of importing a blank article", async () => {
    const scanned = buildTestPdf([[], [], []]);
    await expect(extractPdfArticle(scanned, sourceUrl)).rejects.toThrow(/no text layer/i);
  });

  it("refuses a PDF that carries too little readable text", async () => {
    const thin = buildTestPdf([["Title only"]]);
    await expect(extractPdfArticle(thin, sourceUrl)).rejects.toThrow(/not contain enough readable/i);
  });

  it("refuses a file that is not a readable PDF", async () => {
    await expect(extractPdfArticle(new TextEncoder().encode("not a pdf at all"), sourceUrl))
      .rejects.toThrow(/could not be read/i);
  });
});

describe("the import endpoint routes a PDF response to the PDF reader", () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = { ASSETS: { fetch: async () => new Response("asset") } };
  const importRequest = (url: string) => new Request("https://garden.example/api/import", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  const respondWith = (body: Uint8Array | string, headers: Record<string, string>) =>
    vi.stubGlobal("fetch", async () => new Response(body as BodyInit, { status: 200, headers }));

  it("imports a PDF served as application/pdf", async () => {
    respondWith(buildTestPdf(reportPages, { Title: "Curb Space Allocation Review" }), { "content-type": "application/pdf" });
    const response = await worker.fetch(importRequest("https://city.example/reports/curb.pdf"), env);
    const { article } = await response.json() as { article: { title: string; blocks: unknown[] } };

    expect(response.status).toBe(200);
    expect(article.title).toBe("Curb Space Allocation Review");
    expect(article.blocks.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses a PDF larger than the PDF budget", async () => {
    respondWith(new Uint8Array(4), { "content-type": "application/pdf", "content-length": "12000000" });
    const response = await worker.fetch(importRequest("https://city.example/reports/huge.pdf"), env);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "This PDF is too large to import." });
  });

  it("still refuses content that is neither HTML nor PDF", async () => {
    respondWith("id,value\n1,2", { "content-type": "text/csv" });
    const response = await worker.fetch(importRequest("https://city.example/data/table.csv"), env);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "This URL is not an HTML article or a PDF." });
  });
});
