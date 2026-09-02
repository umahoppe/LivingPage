import type { CanvasType } from "./types";

export interface CanvasFocus {
  canvasType: CanvasType;
  /** Id of the card, node, row, marker, or image the reader last opened. */
  itemId: string;
  label: string;
  /** Research nodes the focused card was built from, when the agent linked any. */
  sourceNodeIds: string[];
  focusedAt: string;
}

let current: CanvasFocus | undefined;

/**
 * The card the reader is looking at, published by every canvas so WebMCP read tools can
 * report it. The Map canvas already reports its viewport; this does the same for the
 * canvases that have no viewport of their own.
 */
export function setCanvasFocus(focus: CanvasFocus | undefined) {
  current = focus;
}

export function getCanvasFocus(): CanvasFocus | undefined {
  return current;
}

/**
 * Records the card the reader just opened and reports which research node to select,
 * so a click both opens the source and tells the agent what the reader is looking at.
 */
export function focusCanvasCard(
  canvasType: CanvasType,
  item: { id: string; label: string; sourceNodeIds?: string[] },
): string | undefined {
  setCanvasFocus({
    canvasType,
    itemId: item.id,
    label: item.label,
    sourceNodeIds: item.sourceNodeIds ?? [],
    focusedAt: new Date().toISOString(),
  });
  return item.sourceNodeIds?.[0];
}
