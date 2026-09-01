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
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
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
  expect(consoleErrors).toEqual([]);
});
