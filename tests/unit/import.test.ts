import { describe, expect, it } from "vitest";
import { extractArticle, validateImportUrl } from "../../worker/index";

const fixture = `<!doctype html>
<html>
  <head>
    <title>Imported research article</title>
    <meta property="og:site_name" content="Evidence Journal">
    <meta property="og:image" content="/hero.jpg">
    <meta name="author" content="Ada Researcher">
    <meta property="article:published_time" content="2026-08-30T10:00:00Z">
  </head>
  <body>
    <nav>Navigation that should not become article content.</nav>
    <article>
      <h1>Imported research article</h1>
      <p>This opening paragraph contains enough meaningful text for article extraction and explains why source-grounded research needs a visible workspace shared by people and agents.</p>
      <h2>A claim worth examining</h2>
      <p>Researchers reported a measurable change, but the publication also warned that regional averages can conceal meaningful differences between local populations and time periods.</p>
      <blockquote>Every confident claim should remain connected to its evidence, assumptions, and credible counterpoints.</blockquote>
      <p>A second explanatory paragraph adds enough context for Readability to identify this document as an article instead of a navigation page or a generic application shell.</p>
    </article>
    <script>window.evil = true;</script>
  </body>
</html>`;

describe("article import", () => {
  it("extracts structured plain-text blocks and metadata", async () => {
    const article = await extractArticle(fixture, new URL("https://journal.example/research/story"));
    expect(article.title).toBe("Imported research article");
    expect(article.author).toContain("Ada Researcher");
    expect(article.siteName).toBe("Evidence Journal");
    expect(article.heroImageUrl).toBe("https://journal.example/hero.jpg");
    expect(article.blocks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(article.blocks.map((block) => block.id)).size).toBe(article.blocks.length);
    expect(article.blocks.some((block) => block.kind === "h2")).toBe(true);
    expect(article.blocks.map((block) => block.text).join(" ")).not.toContain("window.evil");
  });

  it("replaces a single flattened block with uniquely identified fallback paragraphs", async () => {
    const flattenedFixture = `<!doctype html><html><head><title>Flattened article</title></head><body><article>
      <h1>Flattened article</h1>
      <p>The first paragraph contains a focused claim with enough detail to be useful for research and verification.\n\nThe second paragraph provides a separate explanation with enough context to remain a distinct research anchor in the imported article.</p>
    </article></body></html>`;
    const article = await extractArticle(flattenedFixture, new URL("https://journal.example/flattened"));

    expect(article.blocks).toHaveLength(2);
    expect(article.blocks.map((block) => block.id)).toEqual(["imported-0", "imported-1"]);
  });

  it("rejects local and non-HTTP destinations", () => {
    expect(() => validateImportUrl("http://127.0.0.1/private")).toThrow(/Private or local/);
    expect(() => validateImportUrl("http://192.168.1.2/private")).toThrow(/Private or local/);
    expect(() => validateImportUrl("file:///etc/passwd")).toThrow(/Only HTTP and HTTPS/);
  });
});
