import type { MapViewport } from "./types";

let current: MapViewport | undefined;

/** The live map viewport, published by the map canvas so WebMCP read tools can report where the reader is looking. */
export function setMapViewport(viewport: MapViewport | undefined) {
  current = viewport;
}

export function getMapViewport(): MapViewport | undefined {
  return current;
}
