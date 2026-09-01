import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  addAnchor,
  addNodes,
  emptyState,
  normalizeResearchState,
  redo,
  removeAnchor,
  removeCanvasItem,
  removeResearchNode,
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
});
