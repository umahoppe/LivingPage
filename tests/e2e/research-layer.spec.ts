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
  await expect(page.getByRole("tab", { name: /Queue/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Process my marks.", { exact: true })).toBeVisible();
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
  await expect(page.locator(".article-body").getByText("Why this number needs context")).toBeVisible();
  await expect(page.locator(".anchor-inline-list").getByText("Why this number needs context")).toBeVisible();
  await page.getByRole("tab", { name: "Canvas", exact: false }).click();
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

  await expect(page.locator(".anchor-group")).toHaveCount(1);
  await expect(page.getByText("Explained", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close research panel" }).click();
  await expect(page.getByRole("complementary", { name: "Living Page layers" })).toHaveCount(0);

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

test("marks pile up in an in-page queue that the agent reads and clears", async ({ page }) => {
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

  await expect(page.getByRole("tab", { name: /Queue/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".queue-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /3 queued/ })).toBeVisible();
  const nothingCopied = await page.evaluate(() => (window as unknown as { __copiedAgentRequest: string }).__copiedAgentRequest);
  expect(nothingCopied).toBe("");
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
  await expect(page.getByText("Your agent has read this queue.")).toBeVisible();

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

  await page.getByRole("tab", { name: /Queue/ }).click();
  await expect(page.locator(".queue-card")).toHaveCount(0);
  await expect(page.locator(".queue-resolved-row")).toHaveCount(3);
  await expect(page.getByText("No reliable regional dataset for this market yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /queued/ })).toHaveCount(0);

  // The queue survives a reload, and the reader can clear the resolved history.
  await page.reload();
  await page.getByRole("tab", { name: /Queue/ }).click();
  await expect(page.locator(".queue-resolved-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".queue-resolved-row")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
