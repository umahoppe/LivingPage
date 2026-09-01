import { describe, expect, it } from "vitest";
import { addAnchor, addNodes, emptyState, redo, undo } from "../../src/model";

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
});
