import { useEffect, useState } from "react";
import { getCanvasFocus } from "./canvas-focus";
import { getInteractiveState } from "./interactive-state";
import { getMapViewport } from "./map-viewport";
import { MAX_DERIVED_ANCHORS_PER_REQUEST, MAX_INTERACTIVE_FRAME_HEIGHT, MAX_INTERACTIVE_HTML_CHARACTERS } from "./model";
import type {
  AnchorPassageInput,
  AnnotationImageInput,
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
import { getArticleSurface } from "./article-surface";

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
    anchors: anchors.map(({ id, blockId, quote, createdBy, requestId }) => ({ id, blockId, quote, createdBy, requestId: requestId ?? null })),
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
  const liveSelection = window.researchGarden?.getSelection();
  return {
    pageTitle: document.title,
    pageUrl: location.href,
    articleId: state?.document.article.id,
    articleSourceUrl: state?.document.article.sourceUrl,
    articleSiteName: state?.document.article.siteName,
    articleTitle: getArticleSurface()?.getTitle() ?? state?.document.article.title ?? article?.querySelector("h1")?.textContent?.trim(),
    articleContent: state?.document.article.blocks.map((block) => block.text).join(" ").slice(0, 5000)
      ?? article?.textContent?.replace(/\s+/g, " ").trim().slice(0, 5000),
    selectedText: liveSelection?.quote ?? (selection && !selection.isCollapsed ? selection.toString().trim() : ""),
    anchors: state?.document.anchors.map(({ id, blockId, quote, createdBy }) => ({ id, blockId, quote, createdBy })) ?? [],
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
  const visibleBlocks = getArticleSurface()?.getVisibleText() ?? "";
  return {
    currentSection: articlePane?.querySelector("h1")?.textContent?.trim() ?? state.document.article.title,
    visibleText: visibleBlocks,
    activeExplanations: state.document.annotations.filter((item) => !item.isCollapsed),
    highlights: state.document.annotations.filter((item) => item.type === "highlight"),
    focusedResearchNodeIds: state.document.canvasView.focusedNodeIds,
    openPreview: Boolean(document.querySelector(".detail-panel")),
    canvasType: state.document.canvasView.type,
    readerFocus: readerFocus(state),
    mapViewport: getMapViewport() ?? null,
    interactiveState: interactiveReaderState(state.document.canvasView),
    pendingRequestCount: state.requests.filter((request) => request.status === "pending").length,
    revision: state.document.revision,
  };
}

/** Ids the reader can actually click on the current explicitly created canvas. */
function canvasItemIds(state: ResearchState): Set<string> {
  const { type, data } = state.document.canvasView;
  if (type === "map") return new Set((data.map?.markers ?? []).map((marker) => marker.id));
  return new Set(data.interactive ? [data.interactive.id] : []);
}

/**
 * The card the reader last opened on this canvas. A focus recorded on a canvas the reader has
 * since left, or on a card that has since been removed, is stale and reported as none.
 */
function readerFocus(state: ResearchState) {
  const focus = getCanvasFocus();
  if (!focus || focus.canvasType !== state.document.canvasView.type) return null;
  if (!canvasItemIds(state).has(focus.itemId)) return null;
  return focus;
}

/** What the reader did inside the sandboxed widget, reported only while that widget is still the one on screen. */
function interactiveReaderState(canvasView: CanvasViewState) {
  const reported = getInteractiveState();
  if (!reported || reported.canvasId !== canvasView.data.interactive?.id) return null;
  return reported;
}

function getCanvasState() {
  const state = requireBridge().getState();
  const canvasView = state.document.canvasView;
  const focus = readerFocus(state);
  if (canvasView.type === "interactive") {
    return { ...canvasView, readerFocus: focus, interactiveState: interactiveReaderState(canvasView) };
  }
  if (canvasView.type !== "map") return { ...canvasView, readerFocus: focus };
  const viewport = getMapViewport();
  return {
    ...canvasView,
    readerFocus: focus,
    mapViewport: viewport ?? null,
    visibleMarkers: viewport
      ? canvasView.data.map?.markers.filter((marker) => viewport.visibleMarkerIds.includes(marker.id)) ?? []
      : canvasView.data.map?.markers ?? [],
  };
}

const intentToolHints: Record<RequestIntent, string[]> = {
  explain: ["insert_inline_explanation"],
  simplify: ["insert_simplified_layer"],
  visualize: ["create_visualization", "update_visualization", "set_map_view", "insert_image_layer"],
  research: ["create_research_nodes", "add_research_source"],
  verify: ["add_verification", "add_research_source"],
  custom: ["insert_inline_explanation", "create_research_nodes", "create_visualization"],
};

function describeRequest(state: ResearchState, request: PendingRequest) {
  const anchor = state.document.anchors.find((candidate) => candidate.id === request.anchorId);
  const annotations = state.document.annotations.filter((annotation) => annotation.anchorId === request.anchorId);
  const scope = request.anchorId === null ? "document" : "passage";
  const derivedAnchors = state.document.anchors.filter((candidate) => candidate.requestId === request.id);
  return {
    requestId: request.id,
    status: request.status,
    scope,
    intent: request.intent,
    prompt: request.prompt,
    note: request.note ?? null,
    queuedAt: request.createdAt,
    anchorId: request.anchorId,
    blockId: anchor?.blockId ?? null,
    quote: anchor?.quote ?? null,
    surroundingContext: anchor ? `${anchor.prefix}${anchor.quote}${anchor.suffix}` : null,
    suggestedTools: scope === "document"
      ? ["get_article_blocks", "anchor_passage", ...intentToolHints[request.intent]]
      : intentToolHints[request.intent],
    scopeNote: scope === "document"
      ? "The reader asked about the whole article, so no anchor exists yet. Read get_article_blocks, then call anchor_passage with this requestId and the exact words you are answering about; use the anchorId it returns with the tool that fits the intent."
      : "The reader anchored this passage. Use its anchorId directly. When note is present, follow it over the preset prompt. If the answer genuinely depends on another passage, anchor_passage with this requestId can add one more.",
    derivedAnchorIds: derivedAnchors.map((candidate) => candidate.id),
    anchorBudgetLeft: Math.max(0, MAX_DERIVED_ANCHORS_PER_REQUEST - derivedAnchors.length),
    existingLayers: [...new Set(annotations.map((annotation) => annotation.type))],
    researchNodeCount: state.document.nodes.filter((node) => node.anchorId === request.anchorId).length,
    resolutionSummary: request.resolutionSummary ?? null,
    resolvedAt: request.resolvedAt ?? null,
  };
}

/**
 * The Visualize intent covers every visual shape, so the agent needs a rule for choosing one.
 * Without this table it reads "interactive" as "a table the reader can re-sort" every time.
 * The same table lives in the create_visualization description and the selection-menu prompt.
 */
const VISUALIZE_FORM_GUIDE = [
  "Decide what the marked passage is, then build the form that matches it:",
  "process, mechanism, or cause-and-effect chain -> a flow diagram of boxes and arrows the reader steps through",
  "events in order -> a timeline the reader scrubs, on the passage's own dates",
  "parts of a whole, or a structure -> a labelled schematic or tree",
  "a rule or a relationship between quantities -> a model whose sliders change its assumptions",
  "numbers across categories or over time -> a chart, a line for time and bars for categories, with detail on hover",
  "things being compared -> one named comparison axis, every row measured on it, differences first, re-sortable",
  "concepts with no numbers -> an annotated concept map, never a table",
  "A sortable table is the last resort for a numeric passage, not the default shape.",
];

function readPendingRequests(includeResolved: boolean, limit: number) {
  const bridge = requireBridge();
  const state = bridge.getState();
  const pending = state.requests.filter((request) => request.status === "pending");
  const selected = (includeResolved ? state.requests : pending).slice(0, limit);
  const visualizeAnchorIds = pendingVisualizeAnchorIds(state);
  bridge.markQueueRead();
  return {
    revision: state.document.revision,
    articleTitle: state.document.article.title,
    pendingCount: pending.length,
    returnedCount: selected.length,
    visualizeBatch: visualizeAnchorIds.length ? {
      sourceAnchorIds: visualizeAnchorIds,
      formGuide: VISUALIZE_FORM_GUIDE,
      instruction: visualizeAnchorIds.length > 1
        ? "Create one combined visualization that explicitly represents every marked quote. Call create_visualization once with all sourceAnchorIds; the single canvas must not be overwritten once per mark."
        : "Pass this sourceAnchorId to create_visualization so the passage remains linked to its canvas result.",
    } : null,
    requests: selected.map((request) => describeRequest(state, request)),
    nextStep: pending.length
      ? "Work through the pending requests in order. Where an entry has a note, that note is the reader's own instruction for this mark and narrows or overrides its preset prompt. Combine all Visualize marks into the one canvas result and pass every included anchorId as sourceAnchorIds. An entry with scope \"passage\" already carries the reader's anchorId; an entry with scope \"document\" covers the whole article, so read get_article_blocks and anchor the exact words you answer about with anchor_passage first. When a document entry names one term or phrase that recurs, explain it once on its first occurrence and connect the others with add_highlight rather than repeating the same explanation on every anchor. Apply each one with the page-changing tool that fits its intent, then call resolve_request with its requestId so the reader sees it clear."
      : "The reader has not marked anything yet. Ask them to select article text and choose an action from the selection menu.",
  };
}

function pendingVisualizeAnchorIds(state: ResearchState) {
  return [...new Set(state.requests
    .filter((request) => request.status === "pending" && request.intent === "visualize")
    .flatMap((request) => request.anchorId
      ? [request.anchorId]
      : state.document.anchors.filter((anchor) => anchor.requestId === request.id).map((anchor) => anchor.id)))];
}

function validatedVisualizationAnchors(state: ResearchState, supplied: unknown, fallback: string[] = []) {
  const pendingIds = pendingVisualizeAnchorIds(state);
  const explicit = [...new Set((supplied as string[] | undefined) ?? [])];
  const sourceAnchorIds = explicit.length > 0 ? explicit : pendingIds.length === 1 ? pendingIds : fallback;
  const unknownAnchor = sourceAnchorIds.find((id) => !state.document.anchors.some((anchor) => anchor.id === id));
  if (unknownAnchor) throw new Error(`Unknown source anchor: ${unknownAnchor}`);
  const missing = pendingIds.filter((id) => !sourceAnchorIds.includes(id));
  if (missing.length > 0) {
    throw new Error(`There are ${pendingIds.length} pending Visualize marks. Create one combined visualization and pass every sourceAnchorId: ${pendingIds.join(", ")}`);
  }
  return sourceAnchorIds;
}

function readArticleBlocks(offset: number, limit: number) {
  const state = requireBridge().getState();
  const blocks = state.document.article.blocks;
  const anchoredBlockIds = new Set(state.document.anchors.map((anchor) => anchor.blockId));
  const selected = blocks.slice(offset, offset + limit);
  return {
    articleTitle: state.document.article.title,
    articleSourceUrl: state.document.article.sourceUrl ?? null,
    blockCount: blocks.length,
    offset,
    returnedCount: selected.length,
    hasMore: offset + selected.length < blocks.length,
    blocks: selected.map((block) => ({
      blockId: block.id,
      kind: block.kind,
      text: block.text,
      isAnchored: anchoredBlockIds.has(block.id),
    })),
    note: "Quote these words verbatim when you call anchor_passage. The page resolves the position itself and rejects any quote it cannot find.",
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
        description: "Read the visible article context, inline layers, focus, preview, current canvas view, the canvas card the reader last opened (readerFocus), and — when a Map canvas is open — the live map viewport, before changing the experience.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getVisiblePageContext()),
      },
      {
        name: "get_canvas_state",
        title: "Read visual canvas",
        description: "Read the current Visual Thinking Canvas independently from the underlying research nodes and sources. readerFocus reports the card the reader last opened on this canvas — its id, label, and linked research nodes — so when they say 'dig into this one' you already know which one they mean. For a Map canvas this also reports the live viewport the reader is looking at: center, zoom, bounds, and the markers currently on screen. For an Interactive canvas it reports interactiveState — whatever the widget last passed to livingPage.setState, so you can read the slider the reader moved or the option they picked.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getCanvasState()),
      },
      {
        name: "get_pending_requests",
        title: "Read the reader's request queue",
        description: "Read the requests the reader queued by marking passages in the article. This is the reader's own list of what to do, in the order they marked it: each entry carries the intent, the exact anchored quote, its surrounding context, and the tools that fit. An entry whose note is not null carries the reader's own words about that mark — treat the note as the narrower instruction and let it override the preset prompt wherever the two differ. Call this first whenever the reader asks you to handle, process, or work through their marks — do not ask them to restate each request in chat.",
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
        name: "get_article_blocks",
        title: "Read the article as addressable blocks",
        description: "Read the article in full as numbered blocks, each with the blockId and the exact text it contains. Use this before anchor_passage so you quote the article word for word, and whenever a request covers the whole article rather than one marked passage.",
        inputSchema: {
          type: "object",
          properties: {
            offset: { type: "number", minimum: 0, description: "First block to return. Defaults to 0." },
            limit: { type: "number", minimum: 1, maximum: 120, description: "Maximum blocks to return. Defaults to 40." },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => toolResult(readArticleBlocks(
          Math.max(0, Math.round(Number(input.offset ?? 0))),
          Math.min(120, Math.max(1, Math.round(Number(input.limit ?? 40)))),
        )),
      },
      {
        name: "anchor_passage",
        title: "Anchor a passage for a queued request",
        description: `Create a text anchor on the reader's behalf while you work one of their queued requests. Use it when a request covers the whole article and has no anchor yet, or when answering an anchored request genuinely requires a second passage. Quote the article verbatim: the page finds the words itself and refuses a quote it cannot locate, so you cannot anchor text the article does not contain. Anchoring is never unprompted — a pending requestId is required — and one request yields at most ${MAX_DERIVED_ANCHORS_PER_REQUEST} anchors. The returned anchorId works with every anchor-based tool, and the reader sees the anchor marked as yours.`,
        inputSchema: {
          type: "object",
          required: ["requestId", "quote"],
          properties: {
            requestId: { type: "string", description: "A pending requestId from get_pending_requests." },
            quote: { type: "string", maxLength: 1200, description: "The exact words to anchor, copied from the article." },
            blockId: { type: "string", description: "Optional blockId from get_article_blocks, when the same words appear in several blocks." },
            occurrence: { type: "number", minimum: 1, description: "Which occurrence of the quote to anchor. Defaults to the first." },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const { anchor, alreadyExisted } = requireBridge().anchorPassage({
            requestId: input.requestId as string,
            quote: input.quote as string,
            blockId: input.blockId as string | undefined,
            occurrence: input.occurrence as number | undefined,
          } satisfies AnchorPassageInput);
          const state = requireBridge().getState();
          const used = state.document.anchors.filter((candidate) => candidate.requestId === input.requestId).length;
          return toolResult({
            ok: true,
            anchorId: anchor.id,
            blockId: anchor.blockId,
            quote: anchor.quote,
            createdBy: anchor.createdBy,
            alreadyExisted,
            anchorBudgetLeft: Math.max(0, MAX_DERIVED_ANCHORS_PER_REQUEST - used),
          });
        },
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
        name: "insert_image_layer",
        title: "Show pictures beside the text",
        description: "Attach a strip of pictures directly beside an anchored passage, where the reader can look at them while reading. This is where images belong: the visual canvas runs in a sandbox with no network, so it cannot load an external image at all. Give every image an exact, directly linkable http(s) URL and a title that says what it shows; add sourceUrl so the reader can reach the page it came from.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "images"],
          properties: {
            anchorId: { type: "string" },
            title: { type: "string", maxLength: 100, description: "Optional heading for the whole strip." },
            note: { type: "string", maxLength: 600, description: "Optional one-paragraph note above the images." },
            images: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: {
                type: "object",
                required: ["title", "imageUrl"],
                properties: {
                  title: { type: "string", maxLength: 120 },
                  imageUrl: { type: "string", description: "Direct http(s) URL to the image file itself, not the page around it." },
                  note: { type: "string", maxLength: 240 },
                  sourceUrl: { type: "string" },
                  sourceLabel: { type: "string", maxLength: 60 },
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
            type: "images",
            title: input.title as string | undefined,
            content: input.note as string | undefined,
            images: input.images as AnnotationImageInput[],
            relatedNodeIds: input.relatedNodeIds as string[] | undefined,
          });
          return toolResult({ ok: true, anchorId: input.anchorId, imageCount: (input.images as unknown[]).length });
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
        description: `Fill the one visual canvas. It holds exactly two kinds of thing, and sending a new one replaces what is there. When several Visualize marks are pending, combine every marked quote into one result and pass all of their anchorIds in sourceAnchorIds; this tool refuses a partial batch so one mark cannot overwrite another. "interactive" is an html widget you write yourself, and it is how you draw a diagram, a chronology, a comparison, a model the reader can operate, or anything else made of text and markup. "map" is host-drawn, and is the right answer only when the subject is really places — the sandbox blocks the network map tiles come from, so a widget cannot draw one. Pictures are neither: the sandbox cannot load an external image, so put them beside the passage with insert_image_layer. Build from the research layer when one exists, or directly from the article and your own sources when it does not — this tool never requires existing research nodes.

Map data uses map.markers items with id, label, lat, lng, note, kind, sourceUrl, sourceLabel, and sourceNodeIds, plus optional map.center {lat,lng}, map.zoom (1-19), and map.focusMarkerId; supply real WGS84 coordinates yourself, since the page does not geocode place names.

Interactive data uses interactive with id, title, note, sourceNodeIds, and html: one self-contained document body with inline <style> and <script> and no external references, at most ${MAX_INTERACTIVE_HTML_CHARACTERS} characters. Decide what the marked passage actually is before you write any markup, then build the form that matches it: a process, mechanism, or cause-and-effect chain → a flow diagram of boxes and arrows the reader steps through; events in order → a timeline the reader scrubs, on the passage's own dates; parts of a whole, or a structure → a labelled schematic or tree; a rule or a relationship between quantities → a model whose sliders change its assumptions; numbers across categories or over time → a chart, a line for time and bars for categories, with detail on hover; things being compared → one named comparison axis with every row measured on it, the rows where the difference actually shows first, re-sortable; concepts with no numbers → an annotated concept map rather than a table. Match the control to the form too — step buttons for a process, a scrubber for a timeline, sliders for a model, hover for a chart, re-sorting only for a comparison — so "interactive" does not collapse into the same sortable table every time; that table is the last resort for a numeric passage, not the default. Build something the reader can work, not a lone slider: controls that change the assumptions the passage makes, and feedback that shows what those assumptions do. Give the widget a title that states the point. It runs in a sandboxed frame with no network, no storage, and no access to this page, so build everything you need inline: no CDN script, stylesheet, font, or image will load, so draw charts as inline <svg> or on a <canvas> and write any icon yourself. The frame measures the natural height of your document and caps it at ${MAX_INTERACTIVE_FRAME_HEIGHT}px, so lay the widget out in ordinary document flow — 100vh, height:100%, and position:fixed collapse it to nothing. The surrounding page is light, so keep the widget light too. Two calls reach back out of the frame: livingPage.setState(value) whenever the reader changes something, which you read back with get_canvas_state, and livingPage.openCard(nodeId) to open one research card — wire it to any element you built from a research node, using the ids from get_research_layer, so a click still reaches the sourced card behind it. The underlying research data remains unchanged.`,
        inputSchema: {
          type: "object",
          required: ["type", "title", "data"],
          properties: {
            type: { type: "string", enum: ["interactive", "map"] },
            title: { type: "string", maxLength: 120 },
            sourceAnchorIds: { type: "array", items: { type: "string" }, maxItems: 30, description: "Every anchored passage represented by this single canvas result. Required when Visualize marks are pending." },
            sourceNodeIds: { type: "array", items: { type: "string" }, maxItems: 30 },
            data: { type: "object" },
            config: { type: "object" },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const state = requireBridge().getState();
          const sourceAnchorIds = validatedVisualizationAnchors(state, input.sourceAnchorIds);
          const view: Partial<CanvasViewState> & Pick<CanvasViewState, "type"> = {
            type: input.type as CanvasType,
            title: input.title as string,
            sourceAnchorIds,
            focusedNodeIds: input.sourceNodeIds as string[] | undefined,
            layout: "auto",
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
        description: "Update or reframe the current visualization while preserving its source-linked research data. Send the full interactive html again to change the widget; send map data again to change the markers.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["interactive", "map"] },
            title: { type: "string", maxLength: 120 },
            sourceAnchorIds: { type: "array", items: { type: "string" }, maxItems: 30 },
            sourceNodeIds: { type: "array", items: { type: "string" }, maxItems: 30 },
            data: { type: "object" },
            config: { type: "object" },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const state = requireBridge().getState();
          const current = state.document.canvasView;
          requireBridge().setCanvasView({
            type: (input.type as CanvasType | undefined) ?? current.type,
            title: (input.title as string | undefined) ?? current.title,
            sourceAnchorIds: validatedVisualizationAnchors(state, input.sourceAnchorIds, current.sourceAnchorIds),
            focusedNodeIds: (input.sourceNodeIds as string[] | undefined) ?? current.focusedNodeIds,
            layout: current.layout,
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
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("WebMCP registration failed", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return status;
}
