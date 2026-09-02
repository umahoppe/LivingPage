import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  addAnchor,
  addNodes,
  anchorPassage,
  clearResolvedRequests,
  emptyState,
  enqueueRequest,
  normalizeResearchState,
  redo,
  removeAnchor,
  removeCanvasItem,
  removeRequest,
  MAX_DERIVED_ANCHORS_PER_REQUEST,
  MAX_INTERACTIVE_HTML_CHARACTERS,
  removeResearchNode,
  resolveRequest,
  setCanvasView,
  undo,
} from "../../src/model";

function stateWithAnchor() {
  return addAnchor(emptyState(), {
    blockId: "claim-growth",
    quote: "Global EV sales increased by 20% year over year",
    prefix: "",
    suffix: ", suggesting",
    startOffset: 0,
    endOffset: 49,
  });
}

describe("research graph model", () => {
  it("creates a linked agent batch with provenance as one operation", () => {
    const anchored = stateWithAnchor();
    const result = addNodes(
      anchored.state,
      anchored.anchor.id,
      [
        {
          clientId: "verify",
          type: "verify",
          title: "Verify the growth rate",
          summary: "Check the primary dataset.",
          sources: [{
            title: "Global EV Outlook",
            url: "https://example.com/report",
            sourceType: "primary",
            contentType: "pdf",
          }],
        },
        {
          parentId: "verify",
          type: "data",
          title: "Compare regional data",
          summary: "Separate global growth from regional changes.",
        },
      ],
      "Agent filled research gaps",
      "agent",
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1].parentId).toBe(result.nodes[0].id);
    expect(result.state.document.sources[0].nodeId).toBe(result.nodes[0].id);
    expect(result.state.undoStack.at(-1)?.label).toBe("Agent filled research gaps");
  });

  it("undoes and redoes a complete agent batch", () => {
    const anchored = stateWithAnchor();
    const result = addNodes(
      anchored.state,
      anchored.anchor.id,
      [{ type: "counterpoint", title: "Regional decline", summary: "Look for exceptions." }],
      "Agent added a counterpoint",
      "agent",
    );

    const undone = undo(result.state);
    expect(undone.document.nodes).toHaveLength(0);
    const restored = redo(undone);
    expect(restored.document.nodes).toHaveLength(1);
    expect(restored.document.nodes[0].title).toBe("Regional decline");
  });

  it("repairs duplicate imported block IDs and keeps an anchor on the best matching block", () => {
    const state = emptyState();
    state.document.article.blocks = [
      { id: "imported-0", kind: "p", text: "Short claim followed by a much longer flattened copy of the full article." },
      { id: "imported-0", kind: "p", text: "Short claim" },
    ];
    state.document.anchors = [{
      id: "anchor-existing",
      blockId: "imported-0",
      quote: "Short claim",
      prefix: "",
      suffix: "",
      startOffset: 0,
      endOffset: 11,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdBy: "human",
    }];

    const normalized = normalizeResearchState(state);
    expect(normalized.document.article.blocks.map((block) => block.id)).toEqual(["imported-0", "imported-0-2"]);
    expect(normalized.document.anchors[0].blockId).toBe("imported-0-2");
  });

  it("keeps Living Page layers and canvas views in the same reversible history", () => {
    const anchored = stateWithAnchor();
    const explained = addAnnotation(anchored.state, {
      anchorId: anchored.anchor.id,
      type: "explanation",
      title: "What this means",
      content: "The headline compares this year with the previous year.",
      level: "beginner",
    }, "agent");
    const visualized = setCanvasView(explained, {
      type: "diagram",
      title: "How the claim is checked",
      data: {
        diagram: {
          nodes: [{ id: "claim", label: "Claim" }, { id: "source", label: "Primary source" }],
          edges: [{ from: "claim", to: "source", label: "checked against" }],
        },
      },
    }, "agent");

    expect(visualized.document.annotations[0].type).toBe("explanation");
    expect(visualized.document.canvasView.type).toBe("diagram");
    expect(undo(visualized).document.canvasView.type).toBe("diagram");
    expect(undo(undo(visualized)).document.annotations).toHaveLength(0);
  });

  it("removes a mistaken anchor with all dependent content and restores it with Undo", () => {
    const anchored = stateWithAnchor();
    const explained = addAnnotation(anchored.state, {
      anchorId: anchored.anchor.id,
      type: "explanation",
      content: "Explanation",
    }, "agent");
    const researched = addNodes(explained, anchored.anchor.id, [{
      type: "verify",
      title: "Verify",
      summary: "Check it",
      sources: [{ title: "Source", url: "https://example.com/source" }],
    }], "Research", "agent").state;

    const removed = removeAnchor(researched, anchored.anchor.id);
    expect(removed.document.anchors).toHaveLength(0);
    expect(removed.document.annotations).toHaveLength(0);
    expect(removed.document.nodes).toHaveLength(0);
    expect(removed.document.sources).toHaveLength(0);
    expect(undo(removed).document.nodes).toHaveLength(1);
  });

  it("removes an unused anchor with its discarded queue request but preserves attached layers", () => {
    const unused = stateWithAnchor();
    const queuedUnused = enqueueRequest(unused.state, {
      anchorId: unused.anchor.id,
      intent: "simplify",
      prompt: "Simplify this passage.",
    });
    const removedUnused = removeRequest(queuedUnused.state, queuedUnused.request.id);
    expect(removedUnused.requests).toHaveLength(0);
    expect(removedUnused.document.anchors).toHaveLength(0);

    const completed = stateWithAnchor();
    const explained = addAnnotation(completed.state, {
      anchorId: completed.anchor.id,
      type: "explanation",
      content: "This layer has already been applied.",
    }, "agent");
    const queuedCompleted = enqueueRequest(explained, {
      anchorId: completed.anchor.id,
      intent: "explain",
      prompt: "Explain this passage.",
    });
    const removedCompleted = removeRequest(queuedCompleted.state, queuedCompleted.request.id);
    expect(removedCompleted.document.anchors).toHaveLength(1);
    expect(removedCompleted.document.annotations).toHaveLength(1);
  });

  it("cascades child research-card deletion and removes image cards reversibly", () => {
    const anchored = stateWithAnchor();
    const researched = addNodes(anchored.state, anchored.anchor.id, [
      { clientId: "parent", type: "background", title: "Parent", summary: "Parent" },
      { parentId: "parent", type: "data", title: "Child", summary: "Child" },
    ], "Research", "agent").state;
    const withoutParent = removeResearchNode(researched, researched.document.nodes[0].id);
    expect(withoutParent.document.nodes).toHaveLength(0);

    const visualized = setCanvasView(withoutParent, {
      type: "image_board",
      title: "Screenshots",
      data: { imageBoard: [
        { id: "screen-a", title: "A", imageUrl: "https://images.example/a.png", sourceUrl: "https://example.com/a" },
        { id: "screen-b", title: "B", imageUrl: "https://images.example/b.png" },
      ] },
    }, "agent");
    const removedImage = removeCanvasItem(visualized, "screen-a");
    expect(removedImage.document.canvasView.data.imageBoard).toHaveLength(1);
    expect(undo(removedImage).document.canvasView.data.imageBoard).toHaveLength(2);
  });

  it("stores a validated map canvas and removes markers reversibly", () => {
    const mapped = setCanvasView(emptyState(), {
      type: "map",
      title: "Where the shortage is measured",
      data: { map: {
        markers: [
          { id: "kobe", label: "Kobe", lat: 34.69, lng: 135.195, note: "Port cited in the report", sourceUrl: "https://example.com/kobe" },
          { id: "busan", label: "Busan", lat: 35.1796, lng: 129.0756 },
        ],
        center: { lat: 34.9, lng: 132 },
        zoom: 42,
        focusMarkerId: "kobe",
      } },
    }, "agent");

    const map = mapped.document.canvasView.data.map;
    expect(mapped.document.canvasView.type).toBe("map");
    expect(map?.markers).toHaveLength(2);
    expect(map?.zoom).toBe(19);
    expect(map?.focusMarkerId).toBe("kobe");

    const removed = removeCanvasItem(mapped, "kobe");
    expect(removed.document.canvasView.data.map?.markers).toHaveLength(1);
    expect(removed.document.canvasView.data.map?.focusMarkerId).toBeUndefined();
    expect(undo(removed).document.canvasView.data.map?.markers).toHaveLength(2);
  });

  it("stores a self-contained interactive canvas and removes it reversibly", () => {
    const built = setCanvasView(emptyState(), {
      type: "interactive",
      title: "Battery cost model",
      data: { interactive: {
        id: "cost-model",
        title: "  Battery cost model  ",
        html: "<label>Cost</label><input type=\"range\"><script>livingPage.setState({ cost: 90 });</script>",
        note: "Move the slider to see the break-even year.",
        sourceNodeIds: ["node-a"],
      } },
    }, "agent");

    const interactive = built.document.canvasView.data.interactive;
    expect(built.document.canvasView.type).toBe("interactive");
    expect(interactive?.title).toBe("Battery cost model");
    expect(interactive?.sourceNodeIds).toEqual(["node-a"]);

    const removed = removeCanvasItem(built, "cost-model");
    expect(removed.document.canvasView.data.interactive).toBeUndefined();
    expect(undo(removed).document.canvasView.data.interactive?.id).toBe("cost-model");
  });

  it("rejects interactive canvases that are oversized or reach outside their sandbox", () => {
    const interactiveWith = (view: { id?: string; title: string; html: string }) =>
      setCanvasView(emptyState(), { type: "interactive", title: "Widget", data: { interactive: { id: "w", ...view } } }, "agent");

    expect(() => interactiveWith({ title: "", html: "<p>hi</p>" })).toThrow(/title/);
    expect(() => interactiveWith({ title: "Widget", html: "   " })).toThrow(/html/);
    expect(() => interactiveWith({ title: "Widget", html: "x".repeat(MAX_INTERACTIVE_HTML_CHARACTERS + 1) })).toThrow(/limited/);
    expect(() => interactiveWith({
      title: "Widget",
      html: '<script src="https://cdn.example/chart.js"></script>',
    })).toThrow(/self-contained/);
    expect(() => interactiveWith({
      title: "Widget",
      html: '<link rel="stylesheet" href="//cdn.example/app.css">',
    })).toThrow(/self-contained/);
  });

  it("rejects map markers that are not real coordinates", () => {
    const mapWith = (markers: { id: string; label: string; lat: number; lng: number }[]) =>
      setCanvasView(emptyState(), { type: "map", title: "Map", data: { map: { markers } } }, "agent");

    expect(() => mapWith([{ id: "a", label: "Off world", lat: 120, lng: 0 }])).toThrow(/latitude/);
    expect(() => mapWith([{ id: "a", label: "Off world", lat: 0, lng: 900 }])).toThrow(/longitude/);
    expect(() => mapWith([{ id: "a", label: "", lat: 0, lng: 0 }])).toThrow(/label/);
    expect(() => mapWith([
      { id: "a", label: "One", lat: 0, lng: 0 },
      { id: "a", label: "Two", lat: 1, lng: 1 },
    ])).toThrow(/Duplicate/);
  });
});

describe("reader request queue", () => {
  function queued() {
    const anchored = stateWithAnchor();
    return enqueueRequest(anchored.state, {
      anchorId: anchored.anchor.id,
      intent: "explain",
      prompt: "Explain this selection for a beginner.",
    });
  }

  it("queues a marked passage without touching the research graph or the undo stack", () => {
    const anchored = stateWithAnchor();
    const before = anchored.state;
    const { state, request } = enqueueRequest(before, {
      anchorId: anchored.anchor.id,
      intent: "verify",
      prompt: "Verify this claim with reliable sources.",
    });

    expect(request.status).toBe("pending");
    expect(state.requests).toHaveLength(1);
    expect(state.document.revision).toBe(before.document.revision);
    expect(state.undoStack).toHaveLength(before.undoStack.length);
  });

  it("rejects a request for an anchor that does not exist", () => {
    expect(() => enqueueRequest(emptyState(), {
      anchorId: "anchor_missing",
      intent: "explain",
      prompt: "Explain this.",
    })).toThrow(/Unknown anchor/);
  });

  it("resolves a request once and refuses to resolve it twice", () => {
    const { state, request } = queued();
    const resolved = resolveRequest(state, request.id, { summary: "Added an inline explanation.", appliedTo: [] });

    expect(resolved.request.status).toBe("done");
    expect(resolved.request.resolutionSummary).toBe("Added an inline explanation.");
    expect(resolved.state.requests.filter((item) => item.status === "pending")).toHaveLength(0);
    expect(() => resolveRequest(resolved.state, request.id)).toThrow(/already done/);
  });

  it("keeps queued requests across a research commit and drops them with their anchor", () => {
    const { state, request } = queued();
    const grown = addNodes(
      state,
      request.anchorId!,
      [{ type: "verify", title: "Check the figure", summary: "Find the primary dataset." }],
      "Agent grew a branch",
      "agent",
    );
    expect(grown.state.requests).toHaveLength(1);

    const withoutAnchor = removeAnchor(grown.state, request.anchorId!);
    expect(withoutAnchor.requests).toHaveLength(0);
  });

  it("drops a request when the anchor it points at is undone away", () => {
    const anchored = stateWithAnchor();
    const { state, request } = enqueueRequest(anchored.state, {
      anchorId: anchored.anchor.id,
      intent: "map",
      prompt: "Map the places named here.",
    });
    expect(state.requests).toHaveLength(1);

    const undone = undo(state);
    expect(undone.document.anchors).toHaveLength(0);
    expect(undone.requests).toHaveLength(0);
    expect(request.anchorId).toBe(anchored.anchor.id);
  });

  it("removes one request by hand and clears only resolved ones", () => {
    const first = queued();
    const second = enqueueRequest(first.state, {
      anchorId: first.request.anchorId,
      intent: "research",
      prompt: "Research what is missing here.",
    });
    const resolved = resolveRequest(second.state, first.request.id, { summary: "Explained beside the text." });

    expect(clearResolvedRequests(resolved.state).requests.map((item) => item.id)).toEqual([second.request.id]);
    expect(removeRequest(resolved.state, second.request.id).requests.map((item) => item.id)).toEqual([first.request.id]);
  });
});

describe("agent-derived anchors", () => {
  function documentRequest() {
    return enqueueRequest(emptyState(), {
      anchorId: null,
      intent: "verify",
      prompt: "Verify every statistic in this article.",
    });
  }

  it("keeps a document-scoped request even though it owns no anchor", () => {
    const { state, request } = documentRequest();
    expect(request.anchorId).toBeNull();
    expect(normalizeResearchState(state).requests).toHaveLength(1);
  });

  it("resolves a verbatim quote to a real range and records the agent as its author", () => {
    const { state, request } = documentRequest();
    const anchored = anchorPassage(state, {
      requestId: request.id,
      quote: "Global EV sales increased by 20% year over year",
    });
    const { anchor } = anchored;
    const block = anchored.state.document.article.blocks.find((candidate) => candidate.id === anchor.blockId)!;

    expect(anchor.createdBy).toBe("agent");
    expect(anchor.requestId).toBe(request.id);
    expect(anchor.blockId).toBe("claim-growth");
    expect(block.text.slice(anchor.startOffset, anchor.endOffset)).toBe(anchor.quote);
    expect(anchored.state.undoStack.at(-1)?.label).toBe("Agent anchored a passage");
  });

  it("tolerates whitespace differences but refuses a quote the article does not contain", () => {
    const { state, request } = documentRequest();
    const anchored = anchorPassage(state, {
      requestId: request.id,
      quote: "  Lower battery costs,\n  expanding model choice  ",
    });
    expect(anchored.anchor.blockId).toBe("market-context");
    expect(anchored.anchor.quote).toBe("Lower battery costs, expanding model choice");

    expect(() => anchorPassage(state, {
      requestId: request.id,
      quote: "Global EV sales fell by 40% after the subsidy ended",
    })).toThrow(/does not appear in the article/);
  });

  it("refuses to anchor without a pending request from the reader", () => {
    const { state, request } = documentRequest();
    expect(() => anchorPassage(state, { requestId: "request_missing", quote: "Global EV sales" }))
      .toThrow(/Unknown request/);

    const resolved = resolveRequest(state, request.id, { summary: "Answered." });
    expect(() => anchorPassage(resolved.state, { requestId: request.id, quote: "Global EV sales" }))
      .toThrow(/already done/);
  });

  it("reuses the reader's own anchor instead of duplicating it", () => {
    const reader = stateWithAnchor();
    const { state, request } = enqueueRequest(reader.state, {
      anchorId: null,
      intent: "verify",
      prompt: "Verify every statistic in this article.",
    });
    const anchored = anchorPassage(state, {
      requestId: request.id,
      quote: "Global EV sales increased by 20% year over year",
    });

    expect(anchored.alreadyExisted).toBe(true);
    expect(anchored.anchor.id).toBe(reader.anchor.id);
    expect(anchored.anchor.createdBy).toBe("human");
    expect(anchored.state.document.anchors).toHaveLength(1);
  });

  it("caps how many anchors one request can produce", () => {
    const { state, request } = documentRequest();
    const words = [
      "The electric vehicle market", "Global adoption continues to rise", "sharp differences between regions",
      "Global EV sales increased", "the transition has regained momentum", "Lower battery costs",
      "expanding model choice", "purchase incentives", "where the boundary is drawn",
      "which vehicles are counted", "Growth is not evenly distributed",
    ];
    expect(words.length).toBeGreaterThan(MAX_DERIVED_ANCHORS_PER_REQUEST);

    let current = state;
    for (const quote of words.slice(0, MAX_DERIVED_ANCHORS_PER_REQUEST)) {
      current = anchorPassage(current, { requestId: request.id, quote }).state;
    }
    expect(current.document.anchors).toHaveLength(MAX_DERIVED_ANCHORS_PER_REQUEST);
    expect(() => anchorPassage(current, { requestId: request.id, quote: words[MAX_DERIVED_ANCHORS_PER_REQUEST] }))
      .toThrow(/already has 10 agent anchors/);
  });

  it("removes an agent anchor and its layers like any other", () => {
    const { state, request } = documentRequest();
    const anchored = anchorPassage(state, { requestId: request.id, quote: "Growth is not evenly distributed" });
    const annotated = addAnnotation(anchored.state, {
      anchorId: anchored.anchor.id,
      type: "verification",
      status: "mixed",
      content: "The direction holds, the size depends on the dataset.",
    }, "agent");

    const removed = removeAnchor(annotated, anchored.anchor.id);
    expect(removed.document.anchors).toHaveLength(0);
    expect(removed.document.annotations).toHaveLength(0);
    expect(removed.requests).toHaveLength(1);
  });
});
