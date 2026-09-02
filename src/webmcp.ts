import { useEffect, useState } from "react";
import { getMapViewport } from "./map-viewport";
import type {
  AnnotationInput,
  CanvasType,
  CanvasViewState,
  HighlightType,
  MapViewData,
  NodeInput,
  PendingRequest,
  RequestIntent,
  ResearchState,
  SourceInput,
  VerificationStatus,
  VisualizationData,
} from "./types";

type WebMCPStatus = "checking" | "ready" | "unavailable" | "error";

interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

interface ModelContext {
  registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

const toolResult = (value: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

function compactLayer(state: ResearchState, anchorId?: string) {
  const anchors = state.document.anchors.filter((anchor) => !anchorId || anchor.id === anchorId);
  const ids = new Set(anchors.map((anchor) => anchor.id));
  const nodes = state.document.nodes.filter((node) => ids.has(node.anchorId));
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    revision: state.document.revision,
    anchors: anchors.map(({ id, blockId, quote }) => ({ id, blockId, quote })),
    nodes: nodes.map(({ id, anchorId: owner, parentId, type, title, summary, gapReason, createdBy }) => ({
      id,
      anchorId: owner,
      parentId,
      type,
      title,
      summary,
      gapReason,
      createdBy,
      sourceCount: state.document.sources.filter((source) => source.nodeId === id).length,
    })),
    sources: state.document.sources
      .filter((source) => nodeIds.has(source.nodeId))
      .map(({ id, nodeId, title, url, publisher, sourceType, contentType, excerpt }) => ({
        id,
        nodeId,
        title,
        url,
        publisher,
        sourceType,
        contentType,
        excerpt: excerpt?.slice(0, 240),
      })),
  };
}

function getPageContext() {
  const article = document.querySelector("[data-article]");
  const selection = window.getSelection();
  const state = window.researchGarden?.getState();
  return {
    pageTitle: document.title,
    pageUrl: location.href,
    articleId: state?.document.article.id,
    articleSourceUrl: state?.document.article.sourceUrl,
    articleSiteName: state?.document.article.siteName,
    articleTitle: article?.querySelector("h1")?.textContent?.trim(),
    articleContent: article?.textContent?.replace(/\s+/g, " ").trim().slice(0, 5000),
    selectedText: selection && !selection.isCollapsed ? selection.toString().trim() : "",
    anchors: state?.document.anchors.map(({ id, blockId, quote }) => ({ id, blockId, quote })) ?? [],
    graphRevision: state?.document.revision ?? 0,
    canvasType: state?.document.canvasView.type,
    annotationCount: state?.document.annotations.length ?? 0,
    pendingRequestCount: state?.requests.filter((request) => request.status === "pending").length ?? 0,
  };
}

function getCurrentSelection() {
  const bridge = requireBridge();
  const selection = bridge.getSelection();
  if (!selection) return { selectionType: null, selectedText: "", associatedAnchorId: null };
  return {
    selectionType: selection.selectionType,
    selectedText: selection.quote,
    selectedElement: selection.blockId,
    surroundingContext: `${selection.prefix}${selection.quote}${selection.suffix}`,
    position: { startOffset: selection.startOffset, endOffset: selection.endOffset },
    associatedAnchorId: selection.associatedAnchorId ?? null,
  };
}

function getVisiblePageContext() {
  const bridge = requireBridge();
  const state = bridge.getState();
  const articlePane = document.querySelector<HTMLElement>("[data-article]");
  const visibleBlocks = [...document.querySelectorAll<HTMLElement>("[data-block-id]")]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= 64 && rect.top <= window.innerHeight;
    })
    .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 3200);
  return {
    currentSection: articlePane?.querySelector("h1")?.textContent?.trim() ?? state.document.article.title,
    visibleText: visibleBlocks,
    activeExplanations: state.document.annotations.filter((item) => !item.isCollapsed),
    highlights: state.document.annotations.filter((item) => item.type === "highlight"),
    focusedResearchNodeIds: state.document.canvasView.focusedNodeIds,
    openPreview: Boolean(document.querySelector(".detail-panel")),
    canvasType: state.document.canvasView.type,
    mapViewport: getMapViewport() ?? null,
    pendingRequestCount: state.requests.filter((request) => request.status === "pending").length,
    revision: state.document.revision,
  };
}

function getCanvasState() {
  const canvasView = requireBridge().getState().document.canvasView;
  if (canvasView.type !== "map") return canvasView;
  const viewport = getMapViewport();
  return {
    ...canvasView,
    mapViewport: viewport ?? null,
    visibleMarkers: viewport
      ? canvasView.data.map?.markers.filter((marker) => viewport.visibleMarkerIds.includes(marker.id)) ?? []
      : canvasView.data.map?.markers ?? [],
  };
}

const intentToolHints: Record<RequestIntent, string[]> = {
  explain: ["insert_inline_explanation"],
  simplify: ["insert_simplified_layer"],
  visualize: ["create_visualization", "update_visualization"],
  map: ["create_visualization", "set_map_view"],
  research: ["create_research_nodes", "add_research_source"],
  verify: ["add_verification", "add_research_source"],
  custom: ["insert_inline_explanation", "create_research_nodes", "create_visualization"],
};

function describeRequest(state: ResearchState, request: PendingRequest) {
  const anchor = state.document.anchors.find((candidate) => candidate.id === request.anchorId);
  const annotations = state.document.annotations.filter((annotation) => annotation.anchorId === request.anchorId);
  return {
    requestId: request.id,
    status: request.status,
    intent: request.intent,
    prompt: request.prompt,
    note: request.note ?? null,
    queuedAt: request.createdAt,
    anchorId: request.anchorId,
    blockId: anchor?.blockId ?? null,
    quote: anchor?.quote ?? null,
    surroundingContext: anchor ? `${anchor.prefix}${anchor.quote}${anchor.suffix}` : null,
    suggestedTools: intentToolHints[request.intent],
    existingLayers: [...new Set(annotations.map((annotation) => annotation.type))],
    researchNodeCount: state.document.nodes.filter((node) => node.anchorId === request.anchorId).length,
    resolutionSummary: request.resolutionSummary ?? null,
    resolvedAt: request.resolvedAt ?? null,
  };
}

function readPendingRequests(includeResolved: boolean, limit: number) {
  const bridge = requireBridge();
  const state = bridge.getState();
  const pending = state.requests.filter((request) => request.status === "pending");
  const selected = (includeResolved ? state.requests : pending).slice(0, limit);
  bridge.markQueueRead();
  return {
    revision: state.document.revision,
    articleTitle: state.document.article.title,
    pendingCount: pending.length,
    returnedCount: selected.length,
    requests: selected.map((request) => describeRequest(state, request)),
    nextStep: pending.length
      ? "Work through the pending requests in order. Apply each one with the page-changing tool that fits its intent, then call resolve_request with its requestId so the reader sees it clear."
      : "The reader has not marked anything yet. Ask them to select article text and choose an action from the selection menu.",
  };
}

function requireBridge() {
  if (!window.researchGarden) throw new Error("Research Garden is still initializing");
  return window.researchGarden;
}

export function useWebMCP(): WebMCPStatus {
  const [status, setStatus] = useState<WebMCPStatus>(() => document.modelContext ? "checking" : "unavailable");

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const definitions: ToolDefinition[] = [
      {
        name: "get_page_context",
        title: "Read page context",
        description: "Read the current article, text selection, research anchors, and graph revision before researching a claim.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getPageContext()),
      },
      {
        name: "get_research_layer",
        title: "Read research layer",
        description: "Read compact nodes and sources attached to one text anchor or the full current research layer. Use this to find missing perspectives.",
        inputSchema: {
          type: "object",
          properties: {
            anchorId: { type: "string", description: "Optional anchor ID. Omit to read every anchor." },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async ({ anchorId }) => toolResult(compactLayer(requireBridge().getState(), anchorId as string | undefined)),
      },
      {
        name: "get_current_selection",
        title: "Read current selection",
        description: "Read the text selection the person is currently working with, including its durable article anchor when available.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getCurrentSelection()),
      },
      {
        name: "get_visible_page_context",
        title: "Read visible Living Page state",
        description: "Read the visible article context, inline layers, focus, preview, current canvas view, and — when a Map canvas is open — the live map viewport, before changing the experience.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getVisiblePageContext()),
      },
      {
        name: "get_canvas_state",
        title: "Read visual canvas",
        description: "Read the current Visual Thinking Canvas independently from the underlying research nodes and sources. For a Map canvas this also reports the live viewport the reader is looking at: center, zoom, bounds, and the markers currently on screen.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getCanvasState()),
      },
      {
        name: "get_pending_requests",
        title: "Read the reader's request queue",
        description: "Read the requests the reader queued by marking passages in the article. This is the reader's own list of what to do, in the order they marked it: each entry carries the intent, the exact anchored quote, its surrounding context, and the tools that fit. Call this first whenever the reader asks you to handle, process, or work through their marks — do not ask them to restate each request in chat.",
        inputSchema: {
          type: "object",
          properties: {
            includeResolved: { type: "boolean", description: "Include already resolved requests. Defaults to false." },
            limit: { type: "number", minimum: 1, maximum: 50, description: "Maximum requests to return. Defaults to 25." },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => toolResult(readPendingRequests(
          input.includeResolved === true,
          Math.min(50, Math.max(1, Number(input.limit ?? 25))),
        )),
      },
      {
        name: "resolve_request",
        title: "Clear one queued request",
        description: "Mark one queued request as handled after you have actually changed the page for it, or as skipped when you could not. This removes it from the reader's pending queue, so call it once per request instead of reporting progress in chat.",
        inputSchema: {
          type: "object",
          required: ["requestId"],
          properties: {
            requestId: { type: "string", description: "The requestId returned by get_pending_requests." },
            status: { type: "string", enum: ["done", "skipped"], description: "Defaults to done. Use skipped when you made no change." },
            summary: { type: "string", maxLength: 400, description: "One line on what you changed, or why you skipped it." },
            appliedTo: {
              type: "array",
              maxItems: 20,
              items: { type: "string" },
              description: "IDs of the research nodes you created for this request.",
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const resolved = requireBridge().resolveRequest(input.requestId as string, {
            status: input.status as "done" | "skipped" | undefined,
            summary: input.summary as string | undefined,
            appliedTo: input.appliedTo as string[] | undefined,
          });
          const remaining = requireBridge().getState().requests.filter((request) => request.status === "pending").length;
          return toolResult({ ok: true, requestId: resolved.id, status: resolved.status, pendingRemaining: remaining });
        },
      },
      {
        name: "create_research_nodes",
        title: "Grow research branches",
        description: "Atomically add one or more evidence, explanation, or counterpoint branches to a text anchor. Include source provenance when available.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "nodes"],
          properties: {
            anchorId: { type: "string", description: "The text anchor to grow." },
            baseRevision: { type: "number", description: "Graph revision read before this write." },
            operationId: { type: "string", description: "Stable ID for this agent operation." },
            operationLabel: { type: "string", description: "Short human-readable history label." },
            nodes: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                required: ["type", "title", "summary"],
                properties: {
                  clientId: { type: "string", description: "Optional temporary ID for child references in this batch." },
                  parentId: { type: "string", description: "Existing node ID or a clientId from this batch." },
                  type: {
                    type: "string",
                    enum: ["verify", "why", "counterpoint", "primary_source", "data", "background", "summary", "custom"],
                  },
                  contentType: { type: "string", enum: ["text", "webpage", "image", "pdf", "table"] },
                  title: { type: "string", maxLength: 100 },
                  summary: { type: "string", maxLength: 420 },
                  body: { type: "string", maxLength: 1800 },
                  gapReason: { type: "string", maxLength: 220 },
                  sources: {
                    type: "array",
                    maxItems: 5,
                    items: {
                      type: "object",
                      required: ["title", "url"],
                      properties: {
                        title: { type: "string" },
                        url: { type: "string" },
                        publisher: { type: "string" },
                        excerpt: { type: "string" },
                        sourceType: { type: "string", enum: ["primary", "official", "academic", "news", "community", "secondary", "other"] },
                        contentType: { type: "string", enum: ["webpage", "image", "pdf", "dataset"] },
                        publishedAt: { type: "string" },
                        relevantLocation: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const nodes = requireBridge().createNodes({
            anchorId: input.anchorId as string,
            baseRevision: input.baseRevision as number | undefined,
            operationId: input.operationId as string | undefined,
            operationLabel: input.operationLabel as string | undefined,
            nodes: input.nodes as NodeInput[],
          });
          return toolResult({ ok: true, createdNodeIds: nodes.map((node) => node.id), count: nodes.length });
        },
      },
      {
        name: "add_research_source",
        title: "Attach source provenance",
        description: "Attach an exact source URL and provenance metadata to an existing research node.",
        inputSchema: {
          type: "object",
          required: ["nodeId", "title", "url"],
          properties: {
            nodeId: { type: "string" },
            title: { type: "string" },
            url: { type: "string" },
            publisher: { type: "string" },
            excerpt: { type: "string" },
            sourceType: { type: "string", enum: ["primary", "official", "academic", "news", "community", "secondary", "other"] },
            contentType: { type: "string", enum: ["webpage", "image", "pdf", "dataset"] },
            publishedAt: { type: "string" },
            relevantLocation: { type: "string" },
          },
          additionalProperties: false,
        },
        execute: async ({ nodeId, ...source }) => {
          requireBridge().addSource(nodeId as string, source as unknown as SourceInput);
          return toolResult({ ok: true, nodeId });
        },
      },
      {
        name: "insert_inline_explanation",
        title: "Explain beside the text",
        description: "Insert a concise explanation directly beside an anchored article selection. Prefer this over returning a long chat answer.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "explanation"],
          properties: {
            anchorId: { type: "string" },
            title: { type: "string", maxLength: 100 },
            explanation: { type: "string", maxLength: 1200 },
            level: { type: "string", maxLength: 60 },
            relatedNodeIds: { type: "array", items: { type: "string" }, maxItems: 12 },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          requireBridge().addAnnotation({
            anchorId: input.anchorId as string,
            type: "explanation",
            title: input.title as string | undefined,
            content: input.explanation as string,
            level: input.level as string | undefined,
            relatedNodeIds: input.relatedNodeIds as string[] | undefined,
          });
          return toolResult({ ok: true, anchorId: input.anchorId });
        },
      },
      {
        name: "insert_simplified_layer",
        title: "Simplify beside the original",
        description: "Add a reversible simplified version below an anchored passage without overwriting the original text.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "simplifiedText"],
          properties: {
            anchorId: { type: "string" },
            title: { type: "string", maxLength: 100 },
            simplifiedText: { type: "string", maxLength: 1200 },
            level: { type: "string", maxLength: 60 },
            relatedNodeIds: { type: "array", items: { type: "string" }, maxItems: 12 },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          requireBridge().addAnnotation({
            anchorId: input.anchorId as string,
            type: "simplification",
            title: input.title as string | undefined,
            content: input.simplifiedText as string,
            level: input.level as string | undefined,
            relatedNodeIds: input.relatedNodeIds as string[] | undefined,
          });
          return toolResult({ ok: true, anchorId: input.anchorId });
        },
      },
      {
        name: "add_highlight",
        title: "Highlight meaning in the article",
        description: "Apply one restrained semantic highlight to an anchored passage and optionally explain why it matters.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "highlightType"],
          properties: {
            anchorId: { type: "string" },
            highlightType: { type: "string", enum: ["important", "claim", "data", "evidence", "uncertain"] },
            reason: { type: "string", maxLength: 240 },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          requireBridge().addAnnotation({
            anchorId: input.anchorId as string,
            type: "highlight",
            highlightType: input.highlightType as HighlightType,
            reason: input.reason as string | undefined,
          });
          return toolResult({ ok: true, anchorId: input.anchorId });
        },
      },
      {
        name: "add_verification",
        title: "Add source-based verification",
        description: "Attach a cautious, source-based verification state beside an anchored claim. Use mixed or uncertain when evidence is incomplete.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "status", "summary"],
          properties: {
            anchorId: { type: "string" },
            status: { type: "string", enum: ["supported", "mixed", "unsupported", "uncertain"] },
            summary: { type: "string", maxLength: 1200 },
            sources: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                required: ["title", "url"],
                properties: {
                  title: { type: "string" },
                  url: { type: "string" },
                  publisher: { type: "string" },
                  sourceType: { type: "string", enum: ["primary", "official", "academic", "news", "community", "secondary", "other"] },
                },
              },
            },
            relatedNodeIds: { type: "array", items: { type: "string" }, maxItems: 12 },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          requireBridge().addAnnotation({
            anchorId: input.anchorId as string,
            type: "verification",
            status: input.status as VerificationStatus,
            content: input.summary as string,
            sources: input.sources as AnnotationInput["sources"],
            relatedNodeIds: input.relatedNodeIds as string[] | undefined,
          });
          return toolResult({ ok: true, anchorId: input.anchorId });
        },
      },
      {
        name: "create_visualization",
        title: "Transform the visual canvas",
        description: "Create the most useful Diagram, Timeline, Comparison, Image Board, or Map from sourced research. Image Board data uses imageBoard items with id, title, imageUrl, note, sourceUrl, and sourceLabel. Map data uses map.markers items with id, label, lat, lng, note, kind, sourceUrl, sourceLabel, and sourceNodeIds, plus optional map.center {lat,lng}, map.zoom (1-19), and map.focusMarkerId; supply real WGS84 coordinates yourself, since the page does not geocode place names. The underlying research data remains unchanged.",
        inputSchema: {
          type: "object",
          required: ["type", "title", "data"],
          properties: {
            type: { type: "string", enum: ["research_graph", "diagram", "timeline", "comparison_table", "image_board", "map"] },
            title: { type: "string", maxLength: 120 },
            sourceNodeIds: { type: "array", items: { type: "string" }, maxItems: 30 },
            layout: { type: "string", maxLength: 60 },
            data: { type: "object" },
            config: { type: "object" },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const view: Partial<CanvasViewState> & Pick<CanvasViewState, "type"> = {
            type: input.type as CanvasType,
            title: input.title as string,
            focusedNodeIds: input.sourceNodeIds as string[] | undefined,
            layout: (input.layout as string | undefined) ?? "auto",
            visualConfig: (input.config as CanvasViewState["visualConfig"] | undefined) ?? {},
            data: input.data as VisualizationData,
          };
          requireBridge().setCanvasView(view);
          return toolResult({ ok: true, canvasType: view.type });
        },
      },
      {
        name: "set_map_view",
        title: "Move the map",
        description: "Pan, zoom, or focus the Map canvas without resending its markers. Use focusMarkerId to fly to one place, or center and zoom for an area. The Map canvas must already exist.",
        inputSchema: {
          type: "object",
          properties: {
            center: {
              type: "object",
              required: ["lat", "lng"],
              properties: {
                lat: { type: "number", minimum: -90, maximum: 90 },
                lng: { type: "number", minimum: -180, maximum: 180 },
              },
              additionalProperties: false,
            },
            zoom: { type: "number", minimum: 1, maximum: 19 },
            focusMarkerId: { type: "string", description: "Id of a marker already on the map." },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const current = requireBridge().getState().document.canvasView;
          const map = current.data.map;
          if (!map?.markers.length) throw new Error("No map canvas exists yet. Create one with create_visualization first.");
          const focusMarkerId = input.focusMarkerId as string | undefined;
          if (focusMarkerId && !map.markers.some((marker) => marker.id === focusMarkerId)) {
            throw new Error(`Unknown map marker: ${focusMarkerId}`);
          }
          requireBridge().setCanvasView({
            ...current,
            type: "map",
            data: {
              ...current.data,
              map: {
                ...map,
                center: (input.center as MapViewData["center"] | undefined) ?? map.center,
                zoom: (input.zoom as number | undefined) ?? map.zoom,
                focusMarkerId,
              },
            },
          });
          return toolResult({ ok: true, focusMarkerId: focusMarkerId ?? null });
        },
      },
      {
        name: "update_visualization",
        title: "Update the visual canvas",
        description: "Update or reframe the current visualization while preserving its source-linked research data.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["research_graph", "diagram", "timeline", "comparison_table", "image_board", "map"] },
            title: { type: "string", maxLength: 120 },
            sourceNodeIds: { type: "array", items: { type: "string" }, maxItems: 30 },
            layout: { type: "string", maxLength: 60 },
            data: { type: "object" },
            config: { type: "object" },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const current = requireBridge().getState().document.canvasView;
          requireBridge().setCanvasView({
            type: (input.type as CanvasType | undefined) ?? current.type,
            title: (input.title as string | undefined) ?? current.title,
            focusedNodeIds: (input.sourceNodeIds as string[] | undefined) ?? current.focusedNodeIds,
            layout: (input.layout as string | undefined) ?? current.layout,
            visualConfig: (input.config as CanvasViewState["visualConfig"] | undefined) ?? current.visualConfig,
            data: (input.data as VisualizationData | undefined) ?? current.data,
          });
          return toolResult({ ok: true });
        },
      },
    ];

    Promise.all(definitions.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })))
      .then(() => setStatus("ready"))
      .catch((error: unknown) => {
        console.error("WebMCP registration failed", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return status;
}
