import { describe, expect, it } from "vitest";
import { layoutDiagram, readDirection } from "../../src/diagram-layout";
import type { DiagramEdge, DiagramNode } from "../../src/types";

const nodes: DiagramNode[] = [
  { id: "claim", label: "20% growth claim", description: "The statement being tested" },
  { id: "scope", label: "Define scope", description: "Period, geography, and vehicle type" },
  { id: "evidence", label: "Check source", description: "Compare with the primary dataset" },
];
const edges: DiagramEdge[] = [
  { from: "claim", to: "scope", label: "needs" },
  { from: "scope", to: "evidence" },
];

describe("diagram layout", () => {
  it("reads the agent's layout field as a direction and defaults to vertical", () => {
    expect(readDirection("horizontal")).toBe("horizontal");
    expect(readDirection("LR")).toBe("horizontal");
    expect(readDirection("vertical")).toBe("vertical");
    expect(readDirection("auto")).toBe("vertical");
    expect(readDirection(undefined)).toBe("vertical");
  });

  it("places every node inside the reported canvas and routes each edge", () => {
    const graph = layoutDiagram(nodes, edges, "vertical");
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(graph.width);
      expect(node.y + node.height).toBeLessThanOrEqual(graph.height);
    }
    for (const edge of graph.edges) {
      expect(edge.path.startsWith("M")).toBe(true);
    }
  });

  it("ranks a vertical diagram downward and a horizontal one across", () => {
    const vertical = layoutDiagram(nodes, edges, "vertical");
    const horizontal = layoutDiagram(nodes, edges, "horizontal");
    const byId = (graph: ReturnType<typeof layoutDiagram>, id: string) => graph.nodes.find((node) => node.id === id)!;

    expect(byId(vertical, "evidence").y).toBeGreaterThan(byId(vertical, "claim").y);
    expect(byId(vertical, "evidence").x).toBeCloseTo(byId(vertical, "claim").x, 0);
    expect(byId(horizontal, "evidence").x).toBeGreaterThan(byId(horizontal, "claim").x);
    expect(byId(horizontal, "evidence").y).toBeCloseTo(byId(horizontal, "claim").y, 0);
  });

  it("gives a labelled edge a placed label and leaves an unlabelled one without", () => {
    const graph = layoutDiagram(nodes, edges, "vertical");
    const labelled = graph.edges.find((edge) => edge.label === "needs")!;
    const plain = graph.edges.find((edge) => edge.to === "evidence")!;
    expect(labelled.labelX).toBeGreaterThan(0);
    expect(labelled.labelY).toBeGreaterThan(0);
    expect(plain.labelX).toBeUndefined();
  });

  it("drops duplicate nodes, self loops, and edges pointing at nodes it does not have", () => {
    const graph = layoutDiagram(
      [...nodes, { id: "claim", label: "duplicate" }],
      [...edges, { from: "claim", to: "ghost" }, { from: "scope", to: "scope" }],
      "vertical",
    );
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.droppedEdgeCount).toBe(2);
  });

  it("lays out a cycle without hanging", () => {
    const graph = layoutDiagram(nodes, [...edges, { from: "evidence", to: "claim" }], "vertical");
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(3);
  });

  it("returns an empty canvas when the agent sent no nodes", () => {
    const graph = layoutDiagram([], [{ from: "a", to: "b" }]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.width).toBe(0);
    expect(graph.droppedEdgeCount).toBe(1);
  });
});
