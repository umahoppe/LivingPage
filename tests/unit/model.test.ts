import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  addAnchor,
  addNodes,
  clearResolvedRequests,
  emptyState,
  enqueueRequest,
  normalizeResearchState,
  redo,
  removeAnchor,
  removeCanvasItem,
  removeRequest,
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
    expect(undo(visualized).document.canvasView.type).toBe("research_graph");
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
      request.anchorId,
      [{ type: "verify", title: "Check the figure", summary: "Find the primary dataset." }],
      "Agent grew a branch",
      "agent",
    );
    expect(grown.state.requests).toHaveLength(1);

    const withoutAnchor = removeAnchor(grown.state, request.anchorId);
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
