import type { InteractiveReaderState } from "./types";

let current: InteractiveReaderState | undefined;

/**
 * What the reader did inside the sandboxed interactive canvas, published by the frame itself
 * so WebMCP read tools can report it. Like the map viewport, this is live reading position
 * rather than research data: it never enters the document, its revision, or the undo stack.
 */
export function setInteractiveState(state: InteractiveReaderState | undefined) {
  current = state;
}

export function getInteractiveState(): InteractiveReaderState | undefined {
  return current;
}
