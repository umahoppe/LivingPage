import { X } from "lucide-react";
import { useMemo } from "react";
import { focusCanvasCard } from "./canvas-focus";
import { layoutDiagram } from "./diagram-layout";
import { useResearch } from "./research-context";
import type { DiagramNode } from "./types";

/**
 * The Diagram canvas. Dagre places the nodes and routes the edges; the nodes themselves stay
 * ordinary buttons layered over the SVG, so clicking one still opens its sourced research card.
 * With no agent-authored diagram the research layer itself is drawn as the graph.
 */
export function DiagramCanvasView() {
  const { state, setSelectedNodeId, selectedNode, removeVisualizationCard } = useResearch();
  const { data, layout } = state.document.canvasView;
  const diagram = data.diagram;
  const researchNodes = state.document.nodes;

  const graph = useMemo(() => {
    const nodes = diagram?.nodes ?? researchNodes.map((node) => ({
      id: node.id,
      label: node.title,
      description: node.summary,
      sourceNodeIds: [node.id],
    }));
    const edges = diagram?.edges ?? researchNodes
      .filter((node) => node.parentId)
      .map((node) => ({ from: node.parentId!, to: node.id }));
    return layoutDiagram(nodes, edges, layout);
  }, [diagram, researchNodes, layout]);

  const openCard = (node: DiagramNode) => {
    const nodeId = focusCanvasCard("diagram", { id: node.id, label: node.label, sourceNodeIds: node.sourceNodeIds });
    if (nodeId) setSelectedNodeId(nodeId);
  };

  return (
    <div className="visualization diagram-view" data-canvas-type="diagram" data-diagram-direction={graph.direction}>
      <div className="diagram-scroll">
        <div className="diagram-graph" style={{ width: graph.width, height: graph.height }}>
          <svg className="diagram-edges" width={graph.width} height={graph.height} aria-hidden="true">
            <defs>
              <marker id="diagram-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill="#8aa992" />
              </marker>
            </defs>
            {graph.edges.map((edge) => (
              <path key={edge.id} className="diagram-edge" d={edge.path} markerEnd="url(#diagram-arrow)" />
            ))}
          </svg>
          {graph.edges.map((edge) => edge.label && edge.labelX !== undefined && edge.labelY !== undefined && (
            <span
              key={`${edge.id}-label`}
              className="diagram-edge-label"
              style={{ left: edge.labelX, top: edge.labelY, maxWidth: edge.labelWidth }}
            >
              {edge.label}
            </span>
          ))}
          {graph.nodes.map((node) => {
            const isOpen = Boolean(node.sourceNodeIds?.length && selectedNode && node.sourceNodeIds.includes(selectedNode.id));
            return (
              <div
                className={`diagram-node${isOpen ? " open" : ""}`}
                key={node.id}
                data-diagram-node-id={node.id}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
              >
                <button onClick={() => openCard(node)}>
                  <span>{String(node.index + 1).padStart(2, "0")}</span>
                  <strong>{node.label}</strong>
                  {node.description && <p>{node.description}</p>}
                </button>
                <button
                  className="visual-card-delete"
                  onClick={() => removeVisualizationCard(node.id)}
                  aria-label={`Remove visualization card ${node.label}`}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="visual-caption">
        {graph.nodes.length} nodes · {graph.edges.length} relationships · {graph.direction}
      </div>
    </div>
  );
}
