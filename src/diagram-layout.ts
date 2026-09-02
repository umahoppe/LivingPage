import dagre from "@dagrejs/dagre";
import type { DiagramEdge, DiagramNode } from "./types";

export type DiagramDirection = "horizontal" | "vertical";

export interface LaidOutNode extends DiagramNode {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge extends DiagramEdge {
  id: string;
  path: string;
  labelX?: number;
  labelY?: number;
  labelWidth?: number;
}

export interface DiagramLayout {
  direction: DiagramDirection;
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  /** Edges the agent sent that point at a node the diagram does not contain. */
  droppedEdgeCount: number;
}

/** These mirror the .diagram-node rules in styles.css: a node is sized here, before it is painted. */
const NODE_WIDTH = 210;
const NODE_PAD_Y = 12;
const NODE_BORDER = 2;
const INDEX_ROW = 13;
const LABEL_LINE = 15;
const DESCRIPTION_GAP = 5;
const DESCRIPTION_LINE = 13;
const MAX_LABEL_LINES = 3;
const MAX_DESCRIPTION_LINES = 4;

/** A "vertical" diagram reads top to bottom, so dagre ranks downward. */
export function readDirection(layout: string | undefined): DiagramDirection {
  const value = (layout ?? "").trim().toLowerCase();
  if (value === "horizontal" || value === "lr" || value === "left-to-right") return "horizontal";
  return "vertical";
}

/** Layout runs before paint, so line counts are estimated from average glyph width rather than measured. */
function wrappedLines(text: string, charsPerLine: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const next = used === 0 ? word.length : used + 1 + word.length;
    if (next <= charsPerLine) {
      used = next;
      continue;
    }
    lines += 1;
    used = word.length;
  }
  return Math.min(lines, maxLines);
}

function nodeHeight(node: DiagramNode) {
  const labelLines = Math.max(1, wrappedLines(node.label, 26, MAX_LABEL_LINES));
  const descriptionLines = node.description ? wrappedLines(node.description, 36, MAX_DESCRIPTION_LINES) : 0;
  return NODE_PAD_Y * 2 + NODE_BORDER + INDEX_ROW + labelLines * LABEL_LINE
    + (descriptionLines ? DESCRIPTION_GAP + descriptionLines * DESCRIPTION_LINE : 0);
}

function edgeLabelSize(label: string) {
  return { width: Math.min(148, Math.max(30, label.trim().length * 5.1 + 12)), height: 17 };
}

/** Smooths dagre's bend points so an edge reads as one line instead of a chain of segments. */
function toPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  let path = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  for (let index = 0; index < rest.length - 1; index += 1) {
    const point = rest[index];
    const next = rest[index + 1];
    const midX = (point.x + next.x) / 2;
    const midY = (point.y + next.y) / 2;
    path += `Q${point.x.toFixed(1)},${point.y.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)}`;
  }
  const last = rest[rest.length - 1];
  path += `L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  return path;
}

/**
 * Turns the agent's node and edge lists into drawable geometry. Agent data is untrusted,
 * so duplicate ids and edges pointing at absent nodes are dropped rather than thrown on.
 */
export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout?: string,
): DiagramLayout {
  const direction = readDirection(layout);
  const seen = new Set<string>();
  const uniqueNodes = nodes.filter((node) => {
    if (!node?.id || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });

  const usableEdges = edges.filter((edge) => edge && seen.has(edge.from) && seen.has(edge.to) && edge.from !== edge.to);
  const droppedEdgeCount = edges.length - usableEdges.length;

  if (!uniqueNodes.length) {
    return { direction, width: 0, height: 0, nodes: [], edges: [], droppedEdgeCount };
  }

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction === "horizontal" ? "LR" : "TB",
    nodesep: direction === "horizontal" ? 30 : 26,
    ranksep: direction === "horizontal" ? 76 : 56,
    edgesep: 18,
    marginx: 18,
    marginy: 18,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  uniqueNodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight(node) });
  });
  usableEdges.forEach((edge, index) => {
    const label = edge.label?.trim();
    graph.setEdge(
      edge.from,
      edge.to,
      label ? { ...edgeLabelSize(label), labelpos: "c" } : {},
      String(index),
    );
  });

  dagre.layout(graph);

  const laidOutNodes = uniqueNodes.map((node, index) => {
    const placed = graph.node(node.id);
    return {
      ...node,
      index,
      x: placed.x - placed.width / 2,
      y: placed.y - placed.height / 2,
      width: placed.width,
      height: placed.height,
    };
  });

  const laidOutEdges = usableEdges.map((edge, index) => {
    const placed = graph.edge({ v: edge.from, w: edge.to, name: String(index) });
    const label = edge.label?.trim();
    return {
      ...edge,
      id: `${edge.from}->${edge.to}#${index}`,
      path: toPath(placed?.points ?? []),
      labelX: label ? placed?.x : undefined,
      labelY: label ? placed?.y : undefined,
      labelWidth: label ? edgeLabelSize(label).width : undefined,
    };
  });

  const size = graph.graph();
  return {
    direction,
    width: Math.ceil(size.width ?? 0),
    height: Math.ceil(size.height ?? 0),
    nodes: laidOutNodes,
    edges: laidOutEdges,
    droppedEdgeCount,
  };
}
