import { expect, test, type Page } from "@playwright/test";

async function installWebMCPStub(page: Page) {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> = {};
    Object.defineProperty(window, "__webmcpTools", { value: tools, configurable: true });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: { name: string; execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }) {
          tools[tool.name] = tool;
          return Promise.resolve();
        },
      },
    });
  });
}

test("an agent reads an anchor and grows missing research branches", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP connected")).toBeVisible();

  await page.locator('[data-block-id="claim-growth"]').scrollIntoViewIfNeeded();
  await page.locator('[data-block-id="claim-growth"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    const text = element.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 6);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Grow research here" }).click();
  await expect(page.getByText("This anchor is ready", { exact: false })).toBeVisible();

  const toolResult = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const readResult = await tools.get_research_layer.execute({});
    const layer = JSON.parse(readResult.content[0].text) as { revision: number; anchors: Array<{ id: string }> };
    const createResult = await tools.create_research_nodes.execute({
      anchorId: layer.anchors[0].id,
      baseRevision: layer.revision,
      operationId: "gap-audit-1",
      operationLabel: "Agent filled missing research perspectives",
      nodes: [
        {
          type: "verify",
          title: "Verify the 20% growth claim",
          summary: "Check the global total against an original dataset and methodology.",
          gapReason: "The layer contains no primary evidence for the headline number.",
          sources: [{
            title: "Global EV Outlook 2026",
            url: "https://www.iea.org/reports/global-ev-outlook-2026",
            publisher: "International Energy Agency",
            sourceType: "official",
            contentType: "pdf",
            excerpt: "Global electric car sales continued to grow.",
          }],
        },
        {
          type: "why",
          title: "Separate the drivers of growth",
          summary: "Compare the effects of battery costs, model availability, and incentives.",
          gapReason: "A correlation is present, but the causal mechanism is not.",
        },
        {
          type: "counterpoint",
          title: "Test the global average against regional declines",
          summary: "Find markets where sales slowed after incentives changed.",
          gapReason: "A global average may conceal meaningful regional exceptions.",
        },
      ],
    });
    return JSON.parse(createResult.content[0].text) as { count: number };
  });

  expect(toolResult.count).toBe(3);
  await expect(page.getByText("Verify the 20% growth claim")).toBeVisible();
  await expect(page.getByText("Separate the drivers of growth")).toBeVisible();
  await expect(page.getByText("Test the global average against regional declines")).toBeVisible();
  await expect(page.getByText("official", { exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/agent-gap-result.png", fullPage: false });

  await page.getByText("Verify the 20% growth claim").click();
  await expect(page.getByText("Source provenance")).toBeVisible();
  await expect(page.getByText("Global EV Outlook 2026")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Source provenance")).toHaveCount(0);

  await expect(page.getByText("Verify the 20% growth claim")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByText("Verify the 20% growth claim")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Verify the 20% growth claim")).toBeVisible();

  await page.locator('[data-block-id="questions-heading"]').scrollIntoViewIfNeeded();
  await page.locator('[data-block-id="questions-heading"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    const text = element.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 8);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Grow research here" }).click();
  await expect(page.locator('[data-block-id="questions-heading"] [data-anchor-id]')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test("imports a public article and exposes its context to WebMCP", async ({ page }) => {
  await installWebMCPStub(page);
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        article: {
          id: "article_imported_test",
          title: "Cities rethink the curb",
          deck: "A public street can support deliveries, buses, bikes, trees, and places to meet—but not all at once.",
          author: "Mina Ortega",
          publishedAt: "2026-08-31T12:00:00Z",
          sourceUrl: "https://city.example/stories/curb",
          siteName: "City Systems Review",
          importedAt: "2026-09-01T00:00:00Z",
          blocks: [
            { id: "imported-0", kind: "p", text: "Cities are redesigning curb space as delivery traffic, bus lanes, cycling networks, and public seating compete for a narrow strip of street." },
            { id: "imported-1", kind: "quote", text: "A pilot program reduced double parking by 18 percent during weekday delivery hours." },
            { id: "imported-2", kind: "p", text: "The result still needs comparison with nearby streets, enforcement changes, and seasonal traffic before it can support a broader policy claim." },
          ],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Import article", exact: true }).first().click();
  await page.getByLabel("Public article URL").fill("https://city.example/stories/curb");
  await page.getByRole("button", { name: "Import article", exact: true }).last().click();

  await expect(page.getByRole("heading", { name: "Cities rethink the curb" })).toBeVisible();
  await expect(page.getByText("Imported from City Systems Review")).toBeVisible();
  await page.locator('[data-block-id="imported-1"]').scrollIntoViewIfNeeded();
  await page.locator('[data-block-id="imported-1"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Grow research here" }).click();

  const context = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_page_context.execute({});
    return JSON.parse(result.content[0].text) as { articleTitle: string; articleSourceUrl: string; anchors: unknown[] };
  });
  expect(context.articleTitle).toBe("Cities rethink the curb");
  expect(context.articleSourceUrl).toBe("https://city.example/stories/curb");
  expect(context.anchors).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Cities rethink the curb" })).toBeVisible();
  await expect(page.locator("[data-anchor-id]")).toHaveCount(1);
});
