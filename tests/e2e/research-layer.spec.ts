import { expect, test, type Page } from "@playwright/test";

async function installWebMCPStub(page: Page) {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> = {};
    Object.defineProperty(window, "__webmcpTools", { value: tools, configurable: true });
    Object.defineProperty(window, "__copiedAgentRequest", { value: "", writable: true, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          (window as unknown as { __copiedAgentRequest: string }).__copiedAgentRequest = text;
          return Promise.resolve();
        },
      },
    });
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
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

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
  await page.getByRole("button", { name: "Copy agent request for anchor 1" }).click();
  await expect(page.getByText("Request copied")).toBeVisible();
  const copiedRequest = await page.evaluate(() => (window as unknown as { __copiedAgentRequest: string }).__copiedAgentRequest);
  expect(copiedRequest).toContain("get_research_layer");
  expect(copiedRequest).toContain("create_research_nodes");
  expect(copiedRequest).toContain("チャット回答だけで終えず");

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

test("an agent transforms a selection into a sourced Living Page and visual canvas", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  await page.locator('[data-block-id="claim-growth"]').scrollIntoViewIfNeeded();
  await page.locator('[data-block-id="claim-growth"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 49);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Explain selection" }).click();

  const liveResult = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selectionResult = await tools.get_current_selection.execute({});
    const selection = JSON.parse(selectionResult.content[0].text) as { selectedText: string; associatedAnchorId: string };
    const anchorId = selection.associatedAnchorId;
    await tools.insert_inline_explanation.execute({
      anchorId,
      title: "Why this number needs context",
      explanation: "This is a year-over-year rate, so the baseline and geography determine what the percentage means.",
      level: "Beginner",
    });
    await tools.insert_simplified_layer.execute({
      anchorId,
      simplifiedText: "EV sales were about one fifth higher than a year earlier.",
      level: "Plain language",
    });
    await tools.add_highlight.execute({ anchorId, highlightType: "claim", reason: "Key claim" });
    await tools.add_verification.execute({
      anchorId,
      status: "mixed",
      summary: "The direction is supported, but the exact global rate depends on the dataset and period.",
      sources: [{
        title: "Global EV Outlook",
        url: "https://www.iea.org/reports/global-ev-outlook-2026",
        publisher: "IEA",
        sourceType: "official",
      }],
    });
    await tools.create_visualization.execute({
      type: "diagram",
      title: "How to read the growth claim",
      sourceNodeIds: [],
      data: {
        diagram: {
          nodes: [
            { id: "claim", label: "20% growth claim", description: "The statement being tested" },
            { id: "scope", label: "Define scope", description: "Period, geography, and vehicle type" },
            { id: "evidence", label: "Check source", description: "Compare with the primary dataset" },
          ],
          edges: [{ from: "claim", to: "scope" }, { from: "scope", to: "evidence" }],
        },
      },
      config: {},
    });
    const contextResult = await tools.get_visible_page_context.execute({});
    const context = JSON.parse(contextResult.content[0].text) as { canvasType: string; activeExplanations: unknown[] };
    return { selection, context };
  });

  expect(liveResult.selection.selectedText).toContain("Global EV sales increased");
  expect(liveResult.context.canvasType).toBe("diagram");
  expect(liveResult.context.activeExplanations).toHaveLength(4);
  await expect(page.getByText("Why this number needs context")).toBeVisible();
  await expect(page.getByText("EV sales were about one fifth higher")).toBeVisible();
  await expect(page.getByText("mixed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "IEA" })).toBeVisible();
  await expect(page.locator(".research-mark.highlight-claim")).toHaveCount(1);
  await expect(page.locator('[data-canvas-type="diagram"]')).toBeVisible();
  await expect(page.getByText("20% growth claim")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-canvas-type="diagram"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator('[data-canvas-type="diagram"]')).toBeVisible();
  await page.reload();
  await expect(page.getByText("Why this number needs context")).toBeVisible();
  await expect(page.locator('[data-canvas-type="diagram"]')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("image boards auto-open and mistaken anchors or canvas cards can be removed", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.route("https://images.example/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#204c35"/><circle cx="320" cy="180" r="90" fill="#eac369"/></svg>',
    });
  });
  await page.goto("/");

  await page.locator('[data-block-id="claim-growth"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 49);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Explain selection" }).click();
  await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selectionResult = await tools.get_current_selection.execute({});
    const selection = JSON.parse(selectionResult.content[0].text) as { associatedAnchorId: string };
    await tools.insert_inline_explanation.execute({
      anchorId: selection.associatedAnchorId,
      title: "Inline only",
      explanation: "This explanation belongs beside the source text.",
    });
  });

  await expect(page.getByText("Understanding stays beside the text")).toBeVisible();
  await expect(page.locator(".anchor-group")).toHaveCount(0);
  await page.getByRole("button", { name: "Close visual canvas" }).click();
  await expect(page.getByRole("complementary", { name: "Visual Thinking Canvas" })).toHaveCount(0);

  await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.create_visualization.execute({
      type: "image_board",
      title: "Comparable product screens",
      sourceNodeIds: [],
      data: { imageBoard: [
        { id: "screen-a", title: "Product A", imageUrl: "https://images.example/a.svg", note: "Primary screen", sourceUrl: "https://example.com/a", sourceLabel: "Product A source" },
        { id: "screen-b", title: "Product B", imageUrl: "https://images.example/b.svg", note: "Alternative screen", sourceUrl: "https://example.com/b", sourceLabel: "Product B source" },
      ] },
      config: {},
    });
  });

  await expect(page.getByRole("complementary", { name: "Visual Thinking Canvas" })).toBeVisible();
  await expect(page.locator('[data-canvas-type="image_board"] .image-card')).toHaveCount(2);
  await expect(page.locator(".image-card img").first()).toBeVisible();
  expect(await page.locator(".image-card img").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Open image Product A" }).click();
  await expect(page.locator(".image-preview-backdrop")).toBeVisible();
  await page.getByRole("button", { name: "Close image preview" }).click();

  await page.getByRole("button", { name: "Remove visualization card Product A" }).click();
  await expect(page.locator('[data-canvas-type="image_board"] .image-card')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-canvas-type="image_board"] .image-card')).toHaveCount(2);

  await page.locator('[data-block-id="claim-growth"]').scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Remove anchor from article" }).click();
  await expect(page.locator('[data-block-id="claim-growth"] [data-anchor-id]')).toHaveCount(0);
  await expect(page.getByText("Inline only")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Inline only")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
