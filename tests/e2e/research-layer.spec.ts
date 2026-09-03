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
  // The mark waits on the passage it was made on: Layers is the only list there is.
  await expect(page.getByRole("tab", { name: /Layers/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".layer-badge.waiting")).toHaveText("Research · waiting");
  await expect(page.getByRole("button", { name: /1 queued/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear the current request" })).toBeVisible();
  const copiedOnMark = await page.evaluate(() => (window as unknown as { __copiedAgentRequest: string }).__copiedAgentRequest);
  expect(copiedOnMark).toBe("");

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

test("an anchor previews its layers before opening the panel or linked canvas", async ({ page }) => {
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
  await page.getByRole("button", { name: "Grow research here" }).click();

  await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selectionResult = await tools.get_current_selection.execute({});
    const selection = JSON.parse(selectionResult.content[0].text) as { associatedAnchorId: string };
    const layerResult = await tools.get_research_layer.execute({ anchorId: selection.associatedAnchorId });
    const layer = JSON.parse(layerResult.content[0].text) as { revision: number };
    const createdResult = await tools.create_research_nodes.execute({
      anchorId: selection.associatedAnchorId,
      baseRevision: layer.revision,
      operationId: "anchor-peek-e2e",
      operationLabel: "Add preview research",
      nodes: [{
        type: "why",
        title: "Growth is concentrated, not uniform",
        summary: "The global increase can coexist with slower adoption in markets where incentives ended.",
      }],
    });
    const created = JSON.parse(createdResult.content[0].text) as { createdNodeIds: string[] };
    await tools.create_visualization.execute({
      type: "map",
      title: "Markets behind the headline",
      sourceNodeIds: created.createdNodeIds,
      data: { map: { markers: [{
        id: "china",
        label: "China",
        lat: 35.8617,
        lng: 104.1954,
        note: "A major contributor to the global total",
        sourceNodeIds: created.createdNodeIds,
      }] } },
      config: {},
    });
  });

  await page.getByRole("button", { name: "Close research panel" }).click();
  const mark = page.locator(".research-mark").first();
  await mark.hover();
  const preview = page.getByRole("dialog", { name: /Research attached to/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("1 research card", { exact: true })).toBeVisible();
  await expect(preview.getByText("Growth is concentrated, not uniform", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);

  await mark.click({ position: { x: 8, y: 8 } });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Open in Layers" }).click();
  await expect(page.getByRole("complementary", { name: "Living Page layers" })).toBeVisible();
  await expect(preview).toHaveCount(0);

  await page.getByRole("button", { name: "Close research panel" }).click();
  await mark.click({ position: { x: 8, y: 8 } });
  await page.getByRole("button", { name: "Open Map" }).click();
  await expect(page.getByRole("complementary", { name: "Visual Thinking Canvas" })).toBeVisible();
  await expect(page.locator('[data-canvas-type="map"]')).toBeVisible();

  // The pin carries the count of what is not visible from the passage itself.
  await expect(page.locator(".anchor-pin .anchor-pin-count")).toHaveText("1");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await page.getByRole("button", { name: /Preview 1 research card for/ }).click();
  const sheetBox = await preview.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(sheetBox!.x).toBeGreaterThanOrEqual(0);
  expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(consoleErrors).toEqual([]);
});

test("an anchor carrying both kinds of layer points at both of them", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  await page.locator('[data-block-id="claim-growth"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 49);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Grow research here" }).click();

  // One passage answered in both registers: beside the text, and as a card away from it.
  await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selectionResult = await tools.get_current_selection.execute({});
    const { associatedAnchorId: anchorId } = JSON.parse(selectionResult.content[0].text) as { associatedAnchorId: string };
    const layerResult = await tools.get_research_layer.execute({ anchorId });
    const { revision } = JSON.parse(layerResult.content[0].text) as { revision: number };
    await tools.create_research_nodes.execute({
      anchorId,
      baseRevision: revision,
      operationId: "both-kinds-e2e",
      operationLabel: "Add a research card",
      nodes: [{ type: "why", title: "The baseline was depressed", summary: "The comparison quarter followed an incentive expiry." }],
    });
    await tools.insert_inline_explanation.execute({
      anchorId,
      title: "What year over year counts",
      explanation: "The rate compares registrations against the same quarter a year earlier, not against the installed base.",
      level: "Beginner",
    });
  });

  // The heading chip counts everything attached, so a layer can never read as zero.
  await expect(page.locator(".anchor-node-count")).toHaveText("2");

  // The panel row opens where it is, and the arrow is the separate act of going to the passage.
  const inlineRow = page.locator(".anchor-inline-shell").first();
  await expect(inlineRow.locator(".anchor-inline-body")).toHaveCount(0);
  await inlineRow.locator(".anchor-inline-main").click();
  await expect(inlineRow.getByText("The rate compares registrations against the same quarter a year earlier, not against the installed base.")).toBeVisible();

  // The peek promises both kinds in its badges, so it shows one of each rather than only the card.
  await page.getByRole("button", { name: "Close research panel" }).click();
  await page.locator(".research-mark").first().hover();
  const preview = page.getByRole("dialog", { name: /Research attached to/ });
  await expect(preview.getByText("The baseline was depressed", { exact: true })).toBeVisible();
  await expect(preview.getByText("What year over year counts", { exact: true })).toBeVisible();

  // On a narrow viewport the panel is a full-screen overlay: revealing a passage must step aside,
  // or it scrolls an article the reader cannot see.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open research panel" }).click();
  await expect(page.getByRole("complementary", { name: "Living Page layers" })).toBeVisible();
  await page.locator(".anchor-heading").first().click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.locator(".research-mark.revealed").first()).toBeInViewport();

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

test("browses safe page snapshots and restores per-page research when going back", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    // Playwright installs the WebMCP shim in every frame. A production snapshot intentionally
    // refuses that injected script because imported pages never receive allow-scripts.
    if (message.type() === "error" && !message.text().startsWith("Blocked script execution in 'about:srcdoc'")) consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  const snapshot = (title: string, first: string, second: string, link?: string) => `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'">
    <style>body{font-family:Georgia;padding:40px}p{font-size:18px;line-height:1.7}</style><title>${title}</title></head><body>
    <main><h1>${title}</h1><p data-rg-block-id="imported-0">${first}</p>
    <p data-rg-block-id="imported-1">${second}${link ? ` <a href="${link}">Continue to the field report</a>` : ""}</p></main></body></html>`;
  const firstText = "Cities are redesigning curb space as delivery traffic, bus lanes, cycling networks, and public seating compete for a narrow strip of street.";
  const secondText = "The result needs comparison with nearby streets and seasonal traffic before it can support a broader policy claim.";
  const destination = "https://city.example/stories/field-report";

  await page.route("**/api/import", async (route) => {
    const request = JSON.parse(route.request().postData() ?? "{}") as { url?: string };
    const isSecond = request.url === destination;
    const title = isSecond ? "The field report" : "Cities rethink the curb";
    const blocks = isSecond
      ? [
          { id: "imported-0", kind: "p", text: "Field observers counted delivery stops across twelve corridors and recorded how long each vehicle occupied the curb." },
          { id: "imported-1", kind: "p", text: "Their notes distinguish scheduled loading from unplanned stops and explain several gaps in the headline average." },
        ]
      : [
          { id: "imported-0", kind: "p", text: firstText },
          { id: "imported-1", kind: "p", text: `${secondText} Continue to the field report`, links: [{ start: secondText.length + 1, end: secondText.length + 29, url: destination }] },
        ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ article: {
        id: isSecond ? "article_field_report" : "article_curb_snapshot",
        title,
        deck: "A safe static snapshot",
        author: "Mina Ortega",
        sourceUrl: isSecond ? destination : "https://city.example/stories/curb",
        siteName: "City Systems Review",
        importedAt: "2026-09-03T00:00:00Z",
        snapshotHtml: snapshot(title, blocks[0].text, isSecond ? blocks[1].text : secondText, isSecond ? undefined : destination),
        blocks,
      } }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Import article", exact: true }).first().click();
  await page.getByLabel("Public article URL").fill("https://city.example/stories/curb");
  await page.getByRole("button", { name: "Import article", exact: true }).last().click();

  const firstFrame = page.frameLocator('iframe[title="Static snapshot of Cities rethink the curb"]');
  await expect(firstFrame.getByRole("heading", { name: "Cities rethink the curb" })).toBeVisible();
  await firstFrame.locator('[data-rg-block-id="imported-0"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 42);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Verify selection" }).click();
  await expect(firstFrame.locator(".rg-anchor-count")).toHaveText("1 layer");

  const tools = () => page.evaluate(async () => {
    const registered = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selection = JSON.parse((await registered.get_current_selection.execute({})).content[0].text) as { associatedAnchorId: string };
    await registered.add_verification.execute({
      anchorId: selection.associatedAnchorId,
      status: "supported",
      summary: "The source data supports this description.",
      sources: [{ title: "Field report", url: "https://city.example/report", sourceType: "primary" }],
    });
  });
  await tools();
  await expect(firstFrame.locator(".rg-inline-layer")).toContainText("The source data supports this description.");

  await page.getByLabel("Find in page").fill("seasonal traffic");
  await expect(page.locator(".browser-find span")).toHaveText("1");
  expect(await firstFrame.locator("body").evaluate(() => (CSS.highlights.get("rg-search") as Highlight | undefined)?.size ?? 0)).toBe(1);

  await firstFrame.getByRole("link", { name: "Continue to the field report" }).click();
  const secondFrame = page.frameLocator('iframe[title="Static snapshot of The field report"]');
  await expect(secondFrame.getByRole("heading", { name: "The field report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();
  await page.getByRole("button", { name: "Back" }).click();

  const restored = page.frameLocator('iframe[title="Static snapshot of Cities rethink the curb"]');
  await expect(restored.getByRole("heading", { name: "Cities rethink the curb" })).toBeVisible();
  await expect(restored.locator(".rg-anchor-count")).toHaveText("1 layer");
  await expect(restored.locator(".rg-inline-layer")).toContainText("The source data supports this description.");

  await page.getByLabel("Page address or web search").fill("curb allocation evidence");
  await page.getByLabel("Page address or web search").press("Enter");
  await expect(page.getByRole("status")).toContainText("Web search added to your marks");
  const queuedSearch = await page.evaluate(async () => {
    const registered = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await registered.get_pending_requests.execute({});
    return JSON.parse(result.content[0].text) as { requests: Array<{ prompt: string }> };
  });
  expect(queuedSearch.requests.some((request) => request.prompt.includes("curb allocation evidence"))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("snapshot anchors keep canonical offsets and restore their in-page preview", async ({ page }) => {
  await installWebMCPStub(page);
  const canonical = "Alpha linked words continue after deliberately irregular publisher spacing for this imported article paragraph.";
  const snapshotHtml = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"><style>body{padding:40px;font-size:18px}</style></head><body><h1>Whitespace story</h1><p data-rg-block-id="imported-0">\n  Alpha   <a href="https://example.com/more">linked words</a>\n    continue after deliberately irregular publisher spacing for this imported article paragraph. </p></body></html>`;
  await page.route("**/api/import", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ article: {
      id: "article_whitespace",
      title: "Whitespace story",
      deck: "Offset regression",
      author: "Test",
      sourceUrl: "https://example.com/whitespace",
      siteName: "Example",
      importedAt: "2026-09-03T00:00:00Z",
      snapshotHtml,
      blocks: [{ id: "imported-0", kind: "p", text: canonical }],
    } }),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Import article", exact: true }).first().click();
  await page.getByLabel("Public article URL").fill("https://example.com/whitespace");
  await page.getByRole("button", { name: "Import article", exact: true }).last().click();

  const frame = page.frameLocator('iframe[title="Static snapshot of Whitespace story"]');
  await frame.locator('[data-rg-block-id="imported-0"]').evaluate((element) => {
    const link = element.querySelector("a")!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(link.firstChild!, 0);
    range.setEnd(link.nextSibling!, link.nextSibling!.textContent!.indexOf(" after"));
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Verify selection" }).click();

  const current = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    return JSON.parse((await tools.get_current_selection.execute({})).content[0].text) as { selectedText: string; position: { startOffset: number; endOffset: number } };
  });
  expect(current.selectedText).toBe("linked words continue");
  expect(canonical.slice(current.position.startOffset, current.position.endOffset)).toBe(current.selectedText);
  await expect(page.locator(".anchor-quote")).toContainText("linked words continue");

  const pin = frame.locator(".rg-anchor-count");
  await expect(pin).toBeVisible();
  await pin.hover();
  await expect(page.locator(".anchor-peek")).toContainText("linked words continue");
  await pin.click();
  await expect(page.locator(".anchor-peek.pinned")).toBeVisible();
});

test("multiple Visualize marks must become one canvas linked to every passage", async ({ page }) => {
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  const mark = async (blockId: string, length: number) => {
    await page.locator(`[data-block-id="${blockId}"]`).evaluate((element, chars) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, chars);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, length);
    await page.getByRole("button", { name: "Visualize selection" }).click();
  };
  await mark("claim-growth", 34);
  await mark("regional-gap", 34);

  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    return JSON.parse((await tools.get_pending_requests.execute({})).content[0].text) as {
      requests: Array<{ requestId: string; anchorId: string; quote: string }>;
      visualizeBatch: { sourceAnchorIds: string[]; instruction: string };
    };
  });
  expect(queue.visualizeBatch.sourceAnchorIds).toEqual(queue.requests.map((request) => request.anchorId));
  expect(queue.visualizeBatch.instruction).toContain("one combined visualization");

  const partialError = await page.evaluate(async ({ requests }) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    let message = "";
    try {
      await tools.create_visualization.execute({
        type: "interactive",
        title: "Partial",
        sourceAnchorIds: [requests[0].anchorId],
        data: { interactive: { id: "partial", title: "Partial", html: `<p>${requests[0].quote}</p>` } },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await tools.create_visualization.execute({
      type: "interactive",
      title: "Both marked passages",
      sourceAnchorIds: requests.map((request) => request.anchorId),
      data: { interactive: { id: "combined", title: "Both marked passages", html: `<h1>Combined</h1>${requests.map((request) => `<p>${request.quote}</p>`).join("")}` } },
    });
    for (const request of requests) await tools.resolve_request.execute({ requestId: request.requestId, summary: "Included in the combined canvas." });
    return message;
  }, { requests: queue.requests });
  expect(partialError).toContain("pending Visualize marks");

  await page.getByRole("tab", { name: /Canvas/ }).click();
  const canvas = page.frameLocator('[data-canvas-type="interactive"] iframe.interactive-frame');
  await expect(canvas.getByText(queue.requests[0].quote)).toBeVisible();
  await expect(canvas.getByText(queue.requests[1].quote)).toBeVisible();
  await page.getByRole("tab", { name: /Layers/ }).click();
  await expect(page.locator(".layer-badge.canvas")).toHaveCount(2);
  await expect(page.getByText("Nothing is attached to this passage yet.")).toHaveCount(0);
});

test("an imported PDF carries no markup but keeps every layer the page offers", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  // What the PDF reader produces: headings and paragraphs, no in-text links, no hero image.
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        article: {
          id: "article_imported_pdf",
          title: "Curb Space Allocation Review",
          deck: "Cities are re-examining how the curb is allocated between deliveries, buses, bicycles, and places to meet.",
          author: "Mina Ortega",
          publishedAt: "2026-08-31T12:00:00.000Z",
          sourceUrl: "https://city.example/reports/curb-space-review.pdf",
          siteName: "city.example",
          importedAt: "2026-09-01T00:00:00Z",
          blocks: [
            { id: "imported-0", kind: "h2", text: "1 Introduction" },
            { id: "imported-1", kind: "p", text: "Cities are re-examining how the curb is allocated between deliveries, buses, bicycles, trees, and places for people to meet each other." },
            { id: "imported-2", kind: "h2", text: "2 Findings" },
            { id: "imported-3", kind: "p", text: "Measured across twelve corridors, delivery dwell time fell where loading zones were formalised and rose where they were removed entirely." },
          ],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Import article", exact: true }).first().click();
  await page.getByLabel("Public article URL").fill("https://city.example/reports/curb-space-review.pdf");
  await page.getByRole("button", { name: "Import article", exact: true }).last().click();

  await expect(page.getByRole("heading", { name: "Curb Space Allocation Review" })).toBeVisible();
  await expect(page.locator('[data-block-id="imported-0"]')).toHaveRole("heading");
  // Nothing to follow in a side reader: a PDF gives text positions, not anchors and hrefs.
  await expect(page.locator(".article-body a")).toHaveCount(0);
  await expect(page.locator(".imported-hero")).toHaveCount(0);

  await page.locator('[data-block-id="imported-3"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 62);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Grow research here" }).click();

  // Anchoring works off block text and offsets, so the whole layer stack applies unchanged.
  const quote = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selectionResult = await tools.get_current_selection.execute({});
    const { associatedAnchorId: anchorId } = JSON.parse(selectionResult.content[0].text) as { associatedAnchorId: string };
    await tools.add_verification.execute({
      anchorId,
      status: "supported",
      summary: "The corridor count matches the report's own methodology section.",
      sources: [{ title: "Curb Space Allocation Review", url: "https://city.example/reports/curb-space-review.pdf", sourceType: "primary" }],
    });
    const contextResult = await tools.get_page_context.execute({});
    const context = JSON.parse(contextResult.content[0].text) as { anchors: Array<{ quote: string }> };
    return context.anchors[0].quote;
  });
  expect(quote).toBe("Measured across twelve corridors, delivery dwell time fell whe");

  await expect(page.locator(".article-body .inline-layer.verification")).toContainText("The corridor count matches the report's own methodology section.");
  await expect(page.locator(".anchor-node-count")).toHaveText("1");
  await page.reload();
  await expect(page.locator("[data-anchor-id]")).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
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

  const readingHtml = `
<h1>How to read the growth claim</h1>
<label for="scope">Which reading?</label>
<select id="scope">
  <option value="registrations">New registrations worldwide</option>
  <option value="fleet">Share of cars on the road</option>
</select>
<p id="readout">Transition is accelerating</p>
<script>
  var scope = document.getElementById('scope');
  var readout = document.getElementById('readout');
  scope.addEventListener('change', function () {
    readout.textContent = scope.value === 'fleet' ? 'Transition is still early' : 'Transition is accelerating';
    livingPage.setState({ reading: scope.value });
  });
</script>`;

  const liveResult = await page.evaluate(async (html) => {
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
      type: "interactive",
      title: "How to read the growth claim",
      sourceNodeIds: [],
      data: { interactive: { id: "read-the-claim", title: "How to read the growth claim", note: "Pick a reading and see what it commits you to.", html } },
      config: {},
    });
    const contextResult = await tools.get_visible_page_context.execute({});
    const context = JSON.parse(contextResult.content[0].text) as { canvasType: string; activeExplanations: unknown[] };
    return { selection, context };
  }, readingHtml);

  expect(liveResult.selection.selectedText).toContain("Global EV sales increased");
  expect(liveResult.context.canvasType).toBe("interactive");
  expect(liveResult.context.activeExplanations).toHaveLength(4);
  await expect(page.getByText("Why this number needs context")).toBeVisible();
  await expect(page.getByText("EV sales were about one fifth higher")).toBeVisible();
  await expect(page.getByText("mixed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "IEA" })).toBeVisible();
  await expect(page.locator(".research-mark.highlight-claim")).toHaveCount(1);

  // There is no view switcher any more: what the agent last sent is what the canvas shows.
  await expect(page.locator(".canvas-view-switcher")).toHaveCount(0);
  await expect(page.locator('[data-canvas-type="interactive"]')).toBeVisible();
  const widget = page.frameLocator('[data-canvas-type="interactive"] iframe.interactive-frame');
  await expect(widget.locator("#readout")).toHaveText("Transition is accelerating");

  // The reader works the widget; the agent can read what they did without being told.
  await widget.locator("#scope").selectOption("fleet");
  await expect(widget.locator("#readout")).toHaveText("Transition is still early");
  const focus = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const canvasResult = await tools.get_canvas_state.execute({});
    const visibleResult = await tools.get_visible_page_context.execute({});
    return {
      canvas: JSON.parse(canvasResult.content[0].text) as {
        readerFocus: { canvasType: string; itemId: string; label: string } | null;
        interactiveState: { value: { reading: string } } | null;
      },
      visible: JSON.parse(visibleResult.content[0].text) as { readerFocus: { itemId: string } | null },
    };
  });
  expect(focus.canvas.readerFocus).toMatchObject({ canvasType: "interactive", itemId: "read-the-claim", label: "How to read the growth claim" });
  expect(focus.canvas.interactiveState?.value.reading).toBe("fleet");
  expect(focus.visible.readerFocus?.itemId).toBe("read-the-claim");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-canvas-type="interactive"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator('[data-canvas-type="interactive"]')).toBeVisible();
  await page.reload();
  await expect(page.locator(".article-body").getByText("Why this number needs context")).toBeVisible();
  await expect(page.locator(".anchor-inline-list").getByText("Why this number needs context")).toBeVisible();
  await page.getByRole("tab", { name: "Canvas", exact: false }).click();
  await expect(page.locator('[data-canvas-type="interactive"]')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("pictures land beside the text, and mistaken anchors or layers can be removed", async ({ page }) => {
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

  await expect(page.locator(".anchor-group")).toHaveCount(1);
  await expect(page.getByText("Explained", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close research panel" }).click();
  await expect(page.getByRole("complementary", { name: "Living Page layers" })).toHaveCount(0);

  // Pictures are not a canvas view: the sandbox cannot load an external image, and the reader
  // wants to look at them while reading. They go where the explanation went.
  const imaged = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const selectionResult = await tools.get_current_selection.execute({});
    const { associatedAnchorId: anchorId } = JSON.parse(selectionResult.content[0].text) as { associatedAnchorId: string };
    const result = await tools.insert_image_layer.execute({
      anchorId,
      title: "Comparable product screens",
      note: "Two screens the passage is really about.",
      images: [
        { title: "Product A", imageUrl: "https://images.example/a.svg", note: "Primary screen", sourceUrl: "https://example.com/a", sourceLabel: "Product A source" },
        { title: "Product B", imageUrl: "https://images.example/b.svg", note: "Alternative screen", sourceUrl: "https://example.com/b", sourceLabel: "Product B source" },
      ],
    });
    let onTheCanvas = "accepted";
    try {
      await tools.create_visualization.execute({ type: "image_board", title: "Screens", data: {} });
    } catch (error) {
      onTheCanvas = (error as Error).message;
    }
    return { ...(JSON.parse(result.content[0].text) as { imageCount: number }), onTheCanvas };
  });
  expect(imaged.imageCount).toBe(2);
  expect(imaged.onTheCanvas).toMatch(/one Map or one Interactive widget/);

  const strip = page.locator(".article-body .inline-image-strip");
  await expect(strip.locator(".inline-image")).toHaveCount(2);
  await expect(strip.locator("img").first()).toBeVisible();
  expect(await strip.locator("img").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Open image Product A" }).click();
  await expect(page.locator(".image-preview-backdrop")).toBeVisible();
  await page.getByRole("button", { name: "Close image preview" }).click();

  // Applying a layer reopens Layers, which lists the strip the same way it lists an explanation.
  await expect(page.getByRole("complementary", { name: "Living Page layers" })).toBeVisible();
  await expect(page.locator(".layer-badge.images")).toHaveText("Images");

  await page.locator('[data-block-id="claim-growth"]').scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Remove anchor from article" }).click();
  await expect(page.locator('[data-block-id="claim-growth"] [data-anchor-id]')).toHaveCount(0);
  await expect(page.getByText("Inline only")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Inline only")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("an agent maps places from research and moves the reader's viewport", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dfe6dd"/><path d="M0 128h256M128 0v256" stroke="#cbd4c9"/></svg>',
    });
  });
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.create_visualization.execute({
      type: "map",
      title: "Where the shortage was measured",
      sourceNodeIds: [],
      data: { map: {
        markers: [
          { id: "kobe", label: "Port of Kobe", lat: 34.6803, lng: 135.1935, note: "Cited shipment delays", sourceUrl: "https://example.com/kobe", sourceLabel: "Port authority" },
          { id: "busan", label: "Port of Busan", lat: 35.1028, lng: 129.0403, note: "Comparison port" },
        ],
      } },
      config: {},
    });
  });

  await expect(page.getByRole("complementary", { name: "Visual Thinking Canvas" })).toBeVisible();
  await expect(page.locator('[data-canvas-type="map"] .map-legend li')).toHaveCount(2);
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
  await expect(page.locator(".map-pin")).toHaveCount(2);
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  const tile = page.locator(".leaflet-tile-loaded").first();
  await expect(tile).toBeVisible();

  const fitted = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_canvas_state.execute({});
    return JSON.parse(result.content[0].text) as {
      type: string;
      mapViewport: { center: { lat: number; lng: number }; zoom: number; visibleMarkerIds: string[] } | null;
      visibleMarkers: Array<{ id: string }>;
    };
  });
  expect(fitted.type).toBe("map");
  expect(fitted.mapViewport).not.toBeNull();
  expect(fitted.mapViewport!.center.lat).toBeGreaterThan(33);
  expect(fitted.mapViewport!.center.lat).toBeLessThan(36);
  expect(fitted.visibleMarkers.map((marker) => marker.id).sort()).toEqual(["busan", "kobe"]);

  const focused = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.set_map_view.execute({ focusMarkerId: "kobe", zoom: 12 });
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const result = await tools.get_visible_page_context.execute({});
    return JSON.parse(result.content[0].text) as {
      canvasType: string;
      mapViewport: { center: { lat: number; lng: number }; zoom: number } | null;
    };
  });
  expect(focused.canvasType).toBe("map");
  expect(focused.mapViewport!.zoom).toBeGreaterThanOrEqual(12);
  expect(Math.abs(focused.mapViewport!.center.lat - 34.6803)).toBeLessThan(0.5);
  expect(Math.abs(focused.mapViewport!.center.lng - 135.1935)).toBeLessThan(0.5);
  await expect(page.locator(".map-popup strong")).toHaveText("Port of Kobe");

  const zoomedIn = await page.evaluate(async () => {
    const control = document.querySelector<HTMLAnchorElement>(".leaflet-control-zoom-in")!;
    const before = JSON.parse((await (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools.get_canvas_state.execute({})).content[0].text) as { mapViewport: { zoom: number } };
    control.click();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const after = JSON.parse((await (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools.get_canvas_state.execute({})).content[0].text) as { mapViewport: { zoom: number } };
    return { before: before.mapViewport.zoom, after: after.mapViewport.zoom };
  });
  expect(zoomedIn.after).toBe(zoomedIn.before + 1);

  await page.getByRole("button", { name: "Remove map marker Port of Busan" }).click();
  await expect(page.locator('[data-canvas-type="map"] .map-legend li')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-canvas-type="map"] .map-legend li')).toHaveCount(2);
  expect(consoleErrors).toEqual([]);
});

test("marks wait on their own passages until the agent reads and clears them", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  const markPassage = async (blockId: string, action: string, length: number) => {
    await page.locator(`[data-block-id="${blockId}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-block-id="${blockId}"]`).evaluate((element, chars) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      const text = element.firstChild!;
      range.setStart(text, 0);
      range.setEnd(text, chars);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, length);
    await page.getByRole("button", { name: action }).click();
  };

  // The reader marks three places while reading, and never opens a chat in between.
  await markPassage("claim-growth", "Explain selection", 30);
  await markPassage("questions-heading", "Verify selection", 8);
  await markPassage("regional-gap", "Grow research here", 24);

  // No separate Queue tab: each mark is a waiting badge on the anchor it was made on.
  await expect(page.getByRole("tab", { name: /Queue/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Layers/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".anchor-group")).toHaveCount(3);
  await expect(page.locator(".layer-badge.waiting")).toHaveText([
    "Explain · waiting",
    "Verify · waiting",
    "Research · waiting",
  ]);
  await expect(page.locator(".research-pane .layer-count")).toHaveText("3 anchored · 3 waiting");
  const nothingCopied = await page.evaluate(() => (window as unknown as { __copiedAgentRequest: string }).__copiedAgentRequest);
  expect(nothingCopied).toBe("");

  // The handoff text hangs off the count in the ask bar, which is the only place it is needed.
  await page.getByRole("button", { name: /3 queued/ }).click();
  await expect(page.getByRole("button", { name: /Handoff copied/ })).toBeVisible();
  const handoff = await page.evaluate(() => (window as unknown as { __copiedAgentRequest: string }).__copiedAgentRequest);
  expect(handoff).toContain("get_pending_requests");
  expect(handoff).toContain("insert_image_layer");
  await page.screenshot({ path: "output/playwright/request-queue.png", fullPage: false });

  // One sentence in chat later, the agent reads the whole queue through WebMCP.
  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_pending_requests.execute({});
    return JSON.parse(result.content[0].text) as {
      pendingCount: number;
      requests: Array<{ requestId: string; intent: string; anchorId: string; quote: string; suggestedTools: string[] }>;
    };
  });
  expect(queue.pendingCount).toBe(3);
  expect(queue.requests.map((request) => request.intent)).toEqual(["explain", "verify", "research"]);
  expect(queue.requests[0].suggestedTools).toContain("insert_inline_explanation");
  expect(queue.requests[0].quote.length).toBeGreaterThan(0);
  await expect(page.getByText("Your agent has read these marks.")).toBeVisible();

  // It applies each request against the anchor the reader marked, then clears it.
  const remaining = await page.evaluate(async (entries: Array<{ requestId: string; anchorId: string }>) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.insert_inline_explanation.execute({
      anchorId: entries[0].anchorId,
      title: "What the 20% actually counts",
      explanation: "The figure counts new registrations worldwide, not the share of cars on the road.",
    });
    await tools.resolve_request.execute({ requestId: entries[0].requestId, summary: "Explained the figure beside the text." });
    await tools.add_verification.execute({
      anchorId: entries[1].anchorId,
      status: "mixed",
      summary: "The direction holds, but the size of the change depends on the dataset.",
      sources: [{ title: "Global EV Outlook 2026", url: "https://www.iea.org/reports/global-ev-outlook-2026", publisher: "International Energy Agency" }],
    });
    await tools.resolve_request.execute({ requestId: entries[1].requestId, summary: "Added a sourced verification." });
    await tools.resolve_request.execute({
      requestId: entries[2].requestId,
      status: "skipped",
      summary: "No reliable regional dataset for this market yet.",
    });
    const last = await tools.get_pending_requests.execute({});
    return JSON.parse(last.content[0].text) as { pendingCount: number };
  }, queue.requests.map(({ requestId, anchorId }) => ({ requestId, anchorId })));

  expect(remaining.pendingCount).toBe(0);
  await expect(page.getByText("What the 20% actually counts")).toBeVisible();

  await expect(page.locator(".layer-badge.waiting")).toHaveCount(0);
  await expect(page.locator(".pending-request")).toHaveCount(0);
  await expect(page.locator(".queue-resolved-row")).toHaveCount(3);
  await expect(page.getByText("No reliable regional dataset for this market yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /queued/ })).toHaveCount(0);

  // The resolved history survives a reload, and the reader can clear it.
  await page.reload();
  await expect(page.locator(".queue-resolved-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".queue-resolved-row")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

test("a Visualize mark reaches the canvas without any research registered first", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  // The empty canvas must not tell the reader to grow research first, and it offers no view to pick.
  await page.getByRole("tab", { name: /Canvas/ }).click();
  await expect(page.locator(".canvas-view-switcher")).toHaveCount(0);
  await expect(page.getByText("No canvas yet")).toBeVisible();
  await expect(page.getByText(/It draws a diagram, a chronology, a comparison/)).toBeVisible();

  await page.locator('[data-block-id="claim-growth"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    const text = element.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 40);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Visualize selection" }).click();

  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_pending_requests.execute({});
    return JSON.parse(result.content[0].text) as {
      requests: Array<{ requestId: string; intent: string; prompt: string; suggestedTools: string[] }>;
      visualizeBatch: { formGuide: string[] };
    };
  });
  expect(queue.requests.map((request) => request.intent)).toEqual(["visualize"]);
  expect(queue.requests[0].suggestedTools).toContain("create_visualization");
  // One intent now covers every visual shape, so the prompt carries the table the agent chooses from.
  expect(queue.requests[0].prompt).toMatch(/flow diagram/);
  expect(queue.requests[0].prompt).toMatch(/one named comparison axis/);
  expect(queue.visualizeBatch.formGuide.join(" ")).toMatch(/concept map/);

  // The agent answers it straight from the article: no research node exists yet.
  const comparisonHtml = `
<h1>Two readings of the 20%</h1>
<p>Comparison axis: what the percentage is measured against.</p>
<table>
  <tr><th>Reading</th><th>What it counts</th><th>Where it leads</th></tr>
  <tr><td>Optimistic</td><td>New registrations worldwide</td><td>Transition is accelerating</td></tr>
  <tr><td>Cautious</td><td>Share of cars on the road</td><td>Transition is still early</td></tr>
</table>`;

  const state = await page.evaluate(async (html) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.create_visualization.execute({
      type: "interactive",
      title: "Two readings of the 20%",
      data: { interactive: { id: "two-readings", title: "Two readings of the 20%", html } },
    });
    const research = window.researchGarden!.getState();
    return { nodes: research.document.nodes.length, canvasType: research.document.canvasView.type };
  }, comparisonHtml);
  expect(state.nodes).toBe(0);
  expect(state.canvasType).toBe("interactive");

  await expect(page.locator('[data-canvas-type="interactive"]')).toBeVisible();
  const comparison = page.frameLocator('[data-canvas-type="interactive"] iframe.interactive-frame');
  await expect(comparison.getByText("Transition is accelerating")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Canvas/ }).locator("span")).toHaveText("1");

  expect(consoleErrors).toEqual([]);
});

test("a whole-article ask lets the agent anchor the passages it answers about", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  // The reader asks about the article as a whole, without selecting anything.
  await page.getByRole("textbox", { name: "Ask the Living Page" })
    .fill("Verify the strongest statistic in this article and say how solid it is.");
  await page.getByRole("button", { name: "Add to queue" }).click();

  // A whole-article ask has no anchor to sit under, so it gets the pinned row at the top of Layers.
  await expect(page.getByRole("tab", { name: /Layers/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".anchor-group.document-scope .pending-request")).toHaveCount(1);
  await expect(page.getByText(/Whole article · your agent anchors what it answers/)).toBeVisible();
  await expect(page.locator(".research-mark")).toHaveCount(0);

  // The agent sees a document-scoped entry and is told to anchor before answering.
  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_pending_requests.execute({});
    return JSON.parse(result.content[0].text) as {
      requests: Array<{
        requestId: string;
        scope: string;
        anchorId: string | null;
        quote: string | null;
        suggestedTools: string[];
        anchorBudgetLeft: number;
      }>;
    };
  });
  expect(queue.requests[0].scope).toBe("document");
  expect(queue.requests[0].anchorId).toBeNull();
  expect(queue.requests[0].quote).toBeNull();
  expect(queue.requests[0].suggestedTools).toContain("anchor_passage");
  expect(queue.requests[0].anchorBudgetLeft).toBe(10);

  // It reads the article as blocks, anchors the exact words, and answers on that anchor.
  const applied = await page.evaluate(async (requestId: string) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const blocksResult = await tools.get_article_blocks.execute({});
    const article = JSON.parse(blocksResult.content[0].text) as {
      blockCount: number;
      blocks: Array<{ blockId: string; text: string }>;
    };
    const claim = article.blocks.find((block) => block.text.includes("20%"))!;
    const quote = claim.text.slice(0, claim.text.indexOf("year over year") + "year over year".length);

    const anchorResult = await tools.anchor_passage.execute({ requestId, quote });
    const anchored = JSON.parse(anchorResult.content[0].text) as {
      anchorId: string;
      blockId: string;
      quote: string;
      createdBy: string;
      alreadyExisted: boolean;
      anchorBudgetLeft: number;
    };

    await tools.add_verification.execute({
      anchorId: anchored.anchorId,
      status: "mixed",
      summary: "The direction is well supported; the exact size depends on which vehicles are counted.",
      sources: [{
        title: "Global EV Outlook 2026",
        url: "https://www.iea.org/reports/global-ev-outlook-2026",
        publisher: "International Energy Agency",
        sourceType: "official",
      }],
    });

    let invented = "";
    try {
      await tools.anchor_passage.execute({ requestId, quote: "Global EV sales fell by 40% after the subsidy ended" });
    } catch (error) {
      invented = (error as Error).message;
    }
    let unprompted = "";
    try {
      await tools.anchor_passage.execute({ requestId: "request_not_queued", quote: "Growth is not evenly distributed" });
    } catch (error) {
      unprompted = (error as Error).message;
    }

    await tools.resolve_request.execute({ requestId, summary: "Anchored the 20% claim and verified it." });

    // Once the reader's request is cleared, the door closes again.
    let afterResolve = "";
    try {
      await tools.anchor_passage.execute({ requestId, quote: "Growth is not evenly distributed" });
    } catch (error) {
      afterResolve = (error as Error).message;
    }
    return { article, anchored, invented, unprompted, afterResolve };
  }, queue.requests[0].requestId);

  expect(applied.article.blockCount).toBeGreaterThan(3);
  expect(applied.anchored.blockId).toBe("claim-growth");
  expect(applied.anchored.createdBy).toBe("agent");
  expect(applied.anchored.alreadyExisted).toBe(false);
  expect(applied.anchored.anchorBudgetLeft).toBe(9);
  // A quote the article does not contain never becomes an anchor, and the request the
  // reader queued is the only door in.
  expect(applied.invented).toMatch(/does not appear in the article/);
  expect(applied.unprompted).toMatch(/Unknown request/);
  expect(applied.afterResolve).toMatch(/already done/);

  // The reader sees the passage marked in the article, attributed to the agent.
  await expect(page.locator('.research-mark[data-anchor-id]')).toHaveCount(1);
  await expect(page.locator(".article-body").getByText("The direction is well supported")).toBeVisible();
  await page.getByRole("tab", { name: /Layers/ }).click();
  await expect(page.locator(".layer-badge.agent-anchored")).toHaveText("Agent anchored");
  await expect(page.locator(".layer-badge.verified")).toHaveText("Verified");
  await page.screenshot({ path: "output/playwright/agent-anchored-passage.png", fullPage: false });

  // It is an ordinary anchor: undo takes the whole operation back.
  await expect(page.locator(".anchor-group.document-scope")).toHaveCount(0);
  await expect(page.locator(".queue-resolved-row")).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.research-mark[data-anchor-id]')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('.research-mark[data-anchor-id]')).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

test("an agent answers with a widget the reader can operate inside a sandbox", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  // The reader asks for it from the passage itself, without describing the widget in a chat.
  await page.locator('[data-block-id="claim-growth"]').evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    const text = element.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 40);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Visualize selection" }).click();

  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    return JSON.parse((await tools.get_pending_requests.execute({})).content[0].text) as {
      requests: Array<{ intent: string; prompt: string; suggestedTools: string[] }>;
    };
  });
  expect(queue.requests.map((request) => request.intent)).toEqual(["visualize"]);
  expect(queue.requests[0].suggestedTools).toContain("create_visualization");
  expect(queue.requests[0].prompt).toMatch(/sliders change its assumptions/);

  const widgetHtml = `
<h1>Break-even year</h1>
<label for="cost">Battery pack cost</label>
<input id="cost" type="range" min="60" max="140" step="10" value="100">
<p id="readout">100 $/kWh</p>
<script>
  var input = document.getElementById('cost');
  var readout = document.getElementById('readout');
  function isolation() {
    var reachedParent = true;
    try { void parent.document.title; } catch (error) { reachedParent = false; }
    var reachedStorage = true;
    try { void localStorage.length; } catch (error) { reachedStorage = false; }
    return { reachedParent: reachedParent, reachedStorage: reachedStorage };
  }
  input.addEventListener('input', function () {
    readout.textContent = input.value + ' $/kWh';
    livingPage.setState({ cost: Number(input.value), isolation: isolation() });
  });
</script>`;

  await page.evaluate(async (html) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.create_visualization.execute({
      type: "interactive",
      title: "Battery cost model",
      sourceNodeIds: [],
      data: { interactive: { id: "cost-model", title: "Battery cost model", note: "Move the slider to see what the claim depends on.", html } },
      config: {},
    });
  }, widgetHtml);

  await expect(page.getByRole("complementary", { name: "Visual Thinking Canvas" })).toBeVisible();
  const frameElement = page.locator('[data-canvas-type="interactive"] iframe.interactive-frame');
  await expect(frameElement).toHaveAttribute("sandbox", "allow-scripts");
  const widget = page.frameLocator('[data-canvas-type="interactive"] iframe.interactive-frame');
  await expect(widget.locator("#readout")).toHaveText("100 $/kWh");

  await widget.locator("#cost").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(widget.locator("#readout")).toHaveText("130 $/kWh");
  await expect(page.locator("[data-interactive-state]")).toContainText("130");

  const read = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const canvas = JSON.parse((await tools.get_canvas_state.execute({})).content[0].text) as {
      type: string;
      interactiveState: { canvasId: string; value: { cost: number; isolation: { reachedParent: boolean; reachedStorage: boolean } } } | null;
      readerFocus: { itemId: string; label: string } | null;
    };
    const visible = JSON.parse((await tools.get_visible_page_context.execute({})).content[0].text) as { canvasType: string };
    return { canvas, visible };
  });
  expect(read.canvas.type).toBe("interactive");
  expect(read.visible.canvasType).toBe("interactive");
  expect(read.canvas.interactiveState!.canvasId).toBe("cost-model");
  expect(read.canvas.interactiveState!.value.cost).toBe(130);
  expect(read.canvas.interactiveState!.value.isolation).toEqual({ reachedParent: false, reachedStorage: false });
  expect(read.canvas.readerFocus!.itemId).toBe("cost-model");
  await page.screenshot({ path: "output/playwright/interactive-canvas.png", fullPage: false });

  const rejected = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    try {
      await tools.create_visualization.execute({
        type: "interactive",
        title: "Charted",
        data: { interactive: { id: "charted", title: "Charted", html: '<script src="https://cdn.example/chart.js"></' + 'script>' } },
      });
      return "accepted";
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(rejected).toMatch(/self-contained/);
  await expect(widget.locator("#readout")).toHaveText("130 $/kWh");

  await page.getByRole("button", { name: "Reset interactive canvas Battery cost model" }).click();
  await expect(widget.locator("#readout")).toHaveText("100 $/kWh");
  const afterReset = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    return JSON.parse((await tools.get_canvas_state.execute({})).content[0].text) as { interactiveState: unknown };
  });
  expect(afterReset.interactiveState).toBeNull();

  await page.getByRole("button", { name: "Remove interactive canvas Battery cost model" }).click();
  await expect(frameElement).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frameElement).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test("research nodes alone never fill the canvas, and a widget can still open one", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

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

  const grown = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const readResult = await tools.get_research_layer.execute({});
    const layer = JSON.parse(readResult.content[0].text) as { revision: number; anchors: Array<{ id: string }> };
    const createResult = await tools.create_research_nodes.execute({
      anchorId: layer.anchors[0].id,
      baseRevision: layer.revision,
      operationId: "timeline-guard-1",
      operationLabel: "Agent grew research before any visualization existed",
      nodes: [
        { type: "verify", title: "Verify the 20% growth claim", summary: "Check the total against an original dataset." },
        { type: "counterpoint", title: "Test the average against regional declines", summary: "Find markets where sales slowed." },
      ],
    });
    return JSON.parse(createResult.content[0].text) as { count: number };
  });
  expect(grown.count).toBe(2);

  // Research belongs to Layers. The canvas stays empty until the agent explicitly builds something.
  await page.getByRole("tab", { name: /Canvas/ }).click();
  await expect(page.getByText("No canvas yet")).toBeVisible();
  await expect(page.locator(".interactive-frame")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Canvas/ }).locator("span")).toHaveText("0");

  // A chronology is now a widget the agent writes, and it can still reach the sourced card
  // behind an element — that is what openCard replaces the old card click with.
  const nodeIds = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const layer = JSON.parse((await tools.get_research_layer.execute({})).content[0].text) as { nodes: Array<{ id: string; title: string }> };
    return layer.nodes.map((node) => node.id);
  });

  const timelineHtml = `
<h1>How the 20% was reached</h1>
<ol>
  <li><strong>2023</strong> Incentives peak
    <button id="open-source" data-node="NODE_ID">Open the sourced card</button>
  </li>
  <li><strong>2026</strong> Share hits 20%
    <button id="open-missing" data-node="node_not_here">Open a card that is gone</button>
  </li>
</ol>
<script>
  function wire(id) {
    document.getElementById(id).addEventListener('click', function (event) {
      livingPage.openCard(event.currentTarget.getAttribute('data-node'));
    });
  }
  wire('open-source');
  wire('open-missing');
</script>`.replace("NODE_ID", nodeIds[0]);

  await page.evaluate(async (html) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    await tools.create_visualization.execute({
      type: "interactive",
      title: "How the 20% was reached",
      data: { interactive: { id: "chronology", title: "How the 20% was reached", html } },
    });
  }, timelineHtml);

  const chronology = page.frameLocator('[data-canvas-type="interactive"] iframe.interactive-frame');
  await expect(chronology.getByText("Incentives peak")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Canvas/ }).locator("span")).toHaveText("1");

  await chronology.locator("#open-source").click();
  await expect(page.getByText("Source provenance")).toBeVisible();
  await expect(page.locator(".detail-panel").getByText("Verify the 20% growth claim")).toBeVisible();
  await page.locator(".detail-close").click();

  // The frame is untrusted, so a card id the page does not hold opens nothing and says so.
  await chronology.locator("#open-missing").click();
  await expect(page.locator(".detail-panel")).toHaveCount(0);
  await expect(page.locator(".interactive-error")).toContainText("node_not_here");

  expect(consoleErrors).toEqual([]);
});

test("the reader ticks marks and writes the instruction the preset cannot carry", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  const markPassage = async (blockId: string, action: string, length: number) => {
    await page.locator(`[data-block-id="${blockId}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-block-id="${blockId}"]`).evaluate((element, chars) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      const text = element.firstChild!;
      range.setStart(text, 0);
      range.setEnd(text, chars);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, length);
    await page.getByRole("button", { name: action }).click();
  };

  await markPassage("claim-growth", "Explain selection", 30);
  await markPassage("regional-gap", "Visualize selection", 24);

  // The card reads as a sentence to the reader; the agent's own wording stays on the tooltip.
  const visualizeCard = page.locator(".pending-request").first();
  await expect(visualizeCard.locator("p").first())
    .toHaveText("Turn this into a diagram, a chronology, or something you can operate.");
  await expect(visualizeCard.locator("p").first()).toHaveAttribute("title", /flow diagram/);

  // Tick the visible mark, open the earlier passage, tick that one too: the ticks accumulate.
  await visualizeCard.locator(".pending-request-check").check();
  await expect(page.locator(".queue-instruction-head")).toContainText("1 mark selected");
  await page.locator(".anchor-group").first().locator(".anchor-heading").click();
  await page.locator(".anchor-group").first().locator(".pending-request-check").check();
  await expect(page.locator(".queue-instruction-head")).toContainText("2 marks selected");

  await page.locator(".queue-instruction-row input").fill("Answer in Japanese, primary sources only.");
  await page.getByRole("button", { name: "Add instruction" }).click();

  // Applying clears the ticks, and the instruction is now visible on each card it was meant for.
  await expect(page.locator(".queue-instruction-bar")).toHaveCount(0);
  await expect(page.locator(".pending-request-note").first()).toContainText("primary sources only");
  await page.screenshot({ path: "output/playwright/queue-instruction.png", fullPage: false });

  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_pending_requests.execute({});
    return JSON.parse(result.content[0].text) as {
      nextStep: string;
      requests: Array<{ intent: string; note: string | null }>;
    };
  });
  expect(queue.requests.map((request) => request.note)).toEqual([
    "Answer in Japanese, primary sources only.",
    "Answer in Japanese, primary sources only.",
  ]);
  // The agent is told which of the two wordings is the reader's.
  expect(queue.nextStep).toContain("narrows or overrides");

  // Taking the instruction back off one mark leaves the other one carrying it.
  await page.locator(".pending-request-note button").first().click();
  const afterClear = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const result = await tools.get_pending_requests.execute({});
    return (JSON.parse(result.content[0].text) as { requests: Array<{ note: string | null }> }).requests;
  });
  expect(afterClear.filter((request) => request.note).length).toBe(1);

  // "Ask for more here" queues a mark with its angle as the note. It must not write a research
  // card: an unanswered to-do sitting among sourced findings is what this replaced.
  await page.locator(".anchor-group").first().locator(".quick-grow button", { hasText: "Counterpoint" }).click();
  const afterAsk = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const queued = JSON.parse((await tools.get_pending_requests.execute({})).content[0].text) as {
      pendingCount: number;
      requests: Array<{ intent: string; note: string | null }>;
    };
    const layer = JSON.parse((await tools.get_research_layer.execute({})).content[0].text) as { nodes: unknown[] };
    return { queued, nodeCount: layer.nodes.length };
  });
  expect(afterAsk.queued.pendingCount).toBe(3);
  expect(afterAsk.queued.requests.at(-1)).toMatchObject({
    intent: "research",
    note: "Find contrary evidence, regional differences, or a credible opposing view.",
  });
  expect(afterAsk.nodeCount).toBe(0);

  expect(consoleErrors).toEqual([]);
});

test("a term ask explains the word once and marks where else it appears", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installWebMCPStub(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  // The reader names a term instead of a passage: nothing is selected and nothing is anchored yet.
  await page.getByRole("button", { name: "Explain a term wherever it appears" }).click();
  await page.getByRole("textbox", { name: "Ask the Living Page" }).fill("incentives");
  await page.getByRole("textbox", { name: "Ask the Living Page" }).press("Enter");

  await expect(page.locator(".anchor-group.document-scope .pending-request")).toHaveCount(1);
  // The card shows the reader's own line, not the passage wording of the Explain preset.
  await expect(page.locator(".anchor-group.document-scope")).toContainText(
    "Explain “incentives” wherever it appears in this article.",
  );
  await expect(page.locator(".research-mark")).toHaveCount(0);

  const queue = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    return JSON.parse((await tools.get_pending_requests.execute({})).content[0].text) as {
      requests: Array<{ requestId: string; intent: string; scope: string; prompt: string; suggestedTools: string[] }>;
    };
  });
  expect(queue.requests[0]).toMatchObject({ intent: "explain", scope: "document" });
  expect(queue.requests[0].prompt).toContain("occurrence");
  expect(queue.requests[0].suggestedTools).toContain("anchor_passage");

  // The agent anchors both places the term appears, explains it once, and marks the other.
  const applied = await page.evaluate(async (requestId: string) => {
    const tools = (window as unknown as { __webmcpTools: Record<string, { execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcpTools;
    const first = JSON.parse((await tools.anchor_passage.execute({
      requestId,
      quote: "purchase incentives",
    })).content[0].text) as { anchorId: string; blockId: string };
    const second = JSON.parse((await tools.anchor_passage.execute({
      requestId,
      quote: "incentives expired",
    })).content[0].text) as { anchorId: string; blockId: string };

    await tools.insert_inline_explanation.execute({
      anchorId: first.anchorId,
      title: "Purchase incentive",
      explanation: "A subsidy or tax break that lowers what a buyer pays, used to move demand before costs fall on their own.",
      level: "Beginner",
    });
    await tools.add_highlight.execute({
      anchorId: second.anchorId,
      highlightType: "important",
      reason: "Same term, opposite direction: the incentive ends here.",
    });
    await tools.resolve_request.execute({ requestId, summary: "Explained the term once and marked the other occurrence." });
    return { first, second };
  }, queue.requests[0].requestId);

  expect(applied.first.blockId).toBe("market-context");
  expect(applied.second.blockId).toBe("regional-gap");

  await expect(page.locator(".research-mark")).toHaveCount(2);
  await expect(page.locator(".research-mark.highlight-important")).toHaveCount(1);
  await expect(page.locator(".inline-layer-body strong")).toHaveText("Purchase incentive");
  // The explanation is not repeated on the second occurrence.
  await expect(page.locator(".inline-layer")).toHaveCount(1);
  await expect(page.locator(".anchor-group.document-scope")).toHaveCount(0);
  await expect(page.getByText("Explained the term once and marked the other occurrence.")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
