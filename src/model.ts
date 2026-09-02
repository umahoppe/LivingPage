import type {
  Actor,
  AnchorPassageInput,
  AnnotationInput,
  ArticleBlock,
  ArticleDocument,
  CanvasViewState,
  HistoryEntry,
  InteractiveViewData,
  MapViewData,
  NodeInput,
  PendingRequest,
  RequestInput,
  ResearchAnchor,
  ResearchDocument,
  ResearchNode,
  ResearchSource,
  ResearchState,
  SourceInput,
} from "./types";
import { defaultArticle } from "./article-data";

export const STORAGE_KEY = "research-garden:v1";

export const emptyDocument = (): ResearchDocument => ({
  version: 3,
  revision: 0,
  article: structuredClone(defaultArticle),
  anchors: [],
  nodes: [],
  sources: [],
  annotations: [],
  canvasView: {
    type: "research_graph",
    title: "Research",
    focusedNodeIds: [],
    layout: "branch-tree",
    filters: [],
    visualConfig: {},
    data: {},
  },
});

export const emptyState = (): ResearchState => ({
  document: emptyDocument(),
  requests: [],
  undoStack: [],
  redoStack: [],
});

export const MIN_ANCHOR_CHARACTERS = 2;
export const MAX_ANCHOR_CHARACTERS = 1_200;
/** An agent derives anchors only inside one reader request, and never floods the page with them. */
export const MAX_DERIVED_ANCHORS_PER_REQUEST = 10;

export const makeId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const snapshot = (document: ResearchDocument): ResearchDocument => structuredClone(document);

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDocumentBlockIds(document: ResearchDocument): ResearchDocument {
  const usedIds = new Set<string>();
  const groups = new Map<string, Array<{ id: string; text: string }>>();
  let changed = false;

  const blocks = document.article.blocks.map((block, index) => {
    const originalId = block.id || `block-${index}`;
    let id = originalId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${originalId}-${suffix++}`;
    usedIds.add(id);
    if (id !== block.id) changed = true;
    const candidates = groups.get(originalId) ?? [];
    candidates.push({ id, text: block.text });
    groups.set(originalId, candidates);
    return id === block.id ? block : { ...block, id };
  });

  const anchors = document.anchors.map((anchor) => {
    const candidates = groups.get(anchor.blockId);
    if (!candidates?.length) return anchor;
    const quote = normalizedText(anchor.quote);
    const prefix = normalizedText(anchor.prefix);
    const suffix = normalizedText(anchor.suffix);
    const ranked = [...candidates].sort((left, right) => {
      const score = (candidate: { text: string }) => {
        const selected = normalizedText(candidate.text.slice(anchor.startOffset, anchor.endOffset));
        let value = selected === quote ? 1_000 : candidate.text.includes(anchor.quote) ? 100 : 0;
        if (prefix && normalizedText(candidate.text.slice(Math.max(0, anchor.startOffset - anchor.prefix.length), anchor.startOffset)) === prefix) value += 200;
        if (suffix && normalizedText(candidate.text.slice(anchor.endOffset, anchor.endOffset + anchor.suffix.length)) === suffix) value += 200;
        return value;
      };
      return score(right) - score(left) || left.text.length - right.text.length;
    });
    const blockId = ranked[0].id;
    if (blockId === anchor.blockId) return anchor;
    changed = true;
    return { ...anchor, blockId };
  });

  if (!changed) return document;
  return {
    ...document,
    article: { ...document.article, blocks },
    anchors,
  };
}

/** Anchors persisted before authorship was recorded were all made by the reader. */
function withAnchorAuthors(document: ResearchDocument): ResearchDocument {
  if (document.anchors.every((anchor) => anchor.createdBy)) return document;
  return {
    ...document,
    anchors: document.anchors.map((anchor) => anchor.createdBy ? anchor : { ...anchor, createdBy: "human" as Actor }),
  };
}

const normalizeDocument = (document: ResearchDocument) => withAnchorAuthors(normalizeDocumentBlockIds(document));

export function normalizeResearchState(state: ResearchState): ResearchState {
  return withLiveRequests({
    ...state,
    requests: (state.requests ?? []).map((request) => ({ ...request, anchorId: request.anchorId ?? null })),
    document: normalizeDocument(state.document),
    undoStack: state.undoStack.map((entry) => ({ ...entry, document: normalizeDocument(entry.document) })),
    redoStack: state.redoStack.map((entry) => ({ ...entry, document: normalizeDocument(entry.document) })),
  });
}

export function commitDocument(
  state: ResearchState,
  nextDocument: ResearchDocument,
  label: string,
  actor: Actor,
): ResearchState {
  const history: HistoryEntry = {
    label,
    actor,
    timestamp: new Date().toISOString(),
    document: snapshot(state.document),
  };

  return {
    ...state,
    document: { ...nextDocument, revision: state.document.revision + 1 },
    undoStack: [...state.undoStack.slice(-29), history],
    redoStack: [],
  };
}

/**
 * Requests live outside the research document on purpose: queueing a mark must
 * never bump the graph revision an agent is holding as its baseRevision, and it
 * must never land on the undo stack as a research change.
 */
export function withLiveRequests(state: ResearchState): ResearchState {
  const anchorIds = new Set(state.document.anchors.map((anchor) => anchor.id));
  const requests = state.requests.filter((request) => request.anchorId === null || anchorIds.has(request.anchorId));
  return requests.length === state.requests.length ? state : { ...state, requests };
}

export function enqueueRequest(
  state: ResearchState,
  input: RequestInput,
): { state: ResearchState; request: PendingRequest } {
  const anchorId = input.anchorId ?? null;
  if (anchorId !== null && !state.document.anchors.some((anchor) => anchor.id === anchorId)) {
    throw new Error(`Unknown anchor: ${anchorId}`);
  }
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("A queued request needs a prompt");
  const request: PendingRequest = {
    id: makeId("request"),
    anchorId,
    intent: input.intent,
    prompt,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    status: "pending",
    appliedTo: [],
  };
  return { state: { ...state, requests: [...state.requests, request] }, request };
}

export function resolveRequest(
  state: ResearchState,
  requestId: string,
  resolution: { status?: "done" | "skipped"; summary?: string; appliedTo?: string[] } = {},
): { state: ResearchState; request: PendingRequest } {
  const existing = state.requests.find((request) => request.id === requestId);
  if (!existing) throw new Error(`Unknown request: ${requestId}`);
  if (existing.status !== "pending") throw new Error(`Request ${requestId} is already ${existing.status}`);
  const resolved: PendingRequest = {
    ...existing,
    status: resolution.status ?? "done",
    resolvedAt: new Date().toISOString(),
    resolutionSummary: resolution.summary?.trim() || undefined,
    appliedTo: resolution.appliedTo ?? [],
  };
  return {
    state: { ...state, requests: state.requests.map((request) => request.id === requestId ? resolved : request) },
    request: resolved,
  };
}

export function removeRequest(state: ResearchState, requestId: string): ResearchState {
  return { ...state, requests: state.requests.filter((request) => request.id !== requestId) };
}

export function clearResolvedRequests(state: ResearchState): ResearchState {
  return { ...state, requests: state.requests.filter((request) => request.status === "pending") };
}

export function markQueueRead(state: ResearchState): ResearchState {
  return { ...state, queueReadAt: new Date().toISOString() };
}

export function addAnchor(
  state: ResearchState,
  anchor: Omit<ResearchAnchor, "id" | "createdAt" | "createdBy">,
  actor: Actor = "human",
): { state: ResearchState; anchor: ResearchAnchor; alreadyExisted: boolean } {
  const existing = state.document.anchors.find(
    (candidate) => candidate.blockId === anchor.blockId && candidate.quote === anchor.quote,
  );
  if (existing) return { state, anchor: existing, alreadyExisted: true };

  const created: ResearchAnchor = {
    ...anchor,
    id: makeId("anchor"),
    createdAt: new Date().toISOString(),
    createdBy: actor,
  };
  const next = {
    ...state.document,
    anchors: [...state.document.anchors, created],
  };
  const label = actor === "agent" ? "Agent anchored a passage" : "Created a research anchor";
  return { state: commitDocument(state, next, label, actor), anchor: created, alreadyExisted: false };
}

/**
 * Collapse runs of whitespace the way a reader's selection is stored, while keeping
 * the offset of every surviving character in the original block text.
 */
function collapsedWithOffsets(source: string) {
  let text = "";
  const offsets: number[] = [];
  let previousWasSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) {
      if (previousWasSpace || !text.length) continue;
      text += " ";
      offsets.push(index);
      previousWasSpace = true;
      continue;
    }
    text += character;
    offsets.push(index);
    previousWasSpace = false;
  }
  return { text, offsets };
}

/**
 * Resolve a verbatim quote to a range in one block. The agent supplies the words it
 * read; the page decides where they are, so an invented quote cannot become an anchor.
 */
function locateQuote(block: ArticleBlock, quote: string, occurrence: number) {
  const { text, offsets } = collapsedWithOffsets(block.text);
  const needle = normalizedText(quote);
  if (!needle) return undefined;
  let from = 0;
  for (let hit = 0; hit < occurrence; hit += 1) {
    const index = text.indexOf(needle, from);
    if (index < 0) return undefined;
    if (hit === occurrence - 1) {
      const startOffset = offsets[index];
      const endOffset = offsets[index + needle.length - 1] + 1;
      return {
        blockId: block.id,
        quote: needle,
        prefix: block.text.slice(Math.max(0, startOffset - 48), startOffset),
        suffix: block.text.slice(endOffset, endOffset + 48),
        startOffset,
        endOffset,
      };
    }
    from = index + 1;
  }
  return undefined;
}

function countQuoteMatches(block: ArticleBlock, needle: string) {
  const { text } = collapsedWithOffsets(block.text);
  let count = 0;
  let from = 0;
  for (;;) {
    const index = text.indexOf(needle, from);
    if (index < 0) return count;
    count += 1;
    from = index + 1;
  }
}

/**
 * Agent-side anchoring. It is deliberately not a free hand: the agent may only anchor
 * while working a request the reader queued, the quote must exist verbatim in the
 * article, and one request can only produce a handful of anchors.
 */
export function anchorPassage(
  state: ResearchState,
  input: AnchorPassageInput,
): { state: ResearchState; anchor: ResearchAnchor; alreadyExisted: boolean } {
  const request = state.requests.find((candidate) => candidate.id === input.requestId);
  if (!request) {
    throw new Error(`Unknown request: ${input.requestId}. Call get_pending_requests and anchor only for an entry the reader queued.`);
  }
  if (request.status !== "pending") {
    throw new Error(`Request ${input.requestId} is already ${request.status}, so it can no longer take new anchors`);
  }

  const needle = normalizedText(input.quote);
  if (needle.length < MIN_ANCHOR_CHARACTERS) throw new Error("A quote needs at least 2 characters");
  if (needle.length > MAX_ANCHOR_CHARACTERS) throw new Error(`A quote holds at most ${MAX_ANCHOR_CHARACTERS} characters`);

  const derived = state.document.anchors.filter(
    (anchor) => anchor.createdBy === "agent" && anchor.requestId === request.id,
  );
  if (derived.length >= MAX_DERIVED_ANCHORS_PER_REQUEST) {
    throw new Error(`This request already has ${MAX_DERIVED_ANCHORS_PER_REQUEST} agent anchors. Resolve it, or ask the reader to mark more passages.`);
  }

  const blocks = state.document.article.blocks;
  const scope = input.blockId ? blocks.filter((block) => block.id === input.blockId) : blocks;
  if (input.blockId && !scope.length) throw new Error(`Unknown block: ${input.blockId}`);

  const occurrence = Math.max(1, Math.round(input.occurrence ?? 1));
  let remaining = occurrence;
  let located: ReturnType<typeof locateQuote>;
  for (const block of scope) {
    const matches = countQuoteMatches(block, needle);
    if (matches >= remaining) {
      located = locateQuote(block, needle, remaining);
      break;
    }
    remaining -= matches;
  }
  if (!located) {
    throw new Error(
      occurrence > 1
        ? `The article does not contain occurrence ${occurrence} of that quote`
        : "That quote does not appear in the article. Anchor the exact words as they are written, using get_article_blocks.",
    );
  }

  const result = addAnchor(state, { ...located, requestId: request.id }, "agent");
  return result;
}

export function replaceArticle(state: ResearchState, article: ArticleDocument): ResearchState {
  const next = normalizeDocumentBlockIds({
    version: 3,
    revision: state.document.revision,
    article: structuredClone(article),
    anchors: [],
    nodes: [],
    sources: [],
    annotations: [],
    canvasView: {
      type: "research_graph",
      title: "Research",
      focusedNodeIds: [],
      layout: "branch-tree",
      filters: [],
      visualConfig: {},
      data: {},
    },
  });
  return withLiveRequests(commitDocument(state, next, `Imported article: ${article.title}`, "human"));
}

function validateAnnotationSources(input: AnnotationInput) {
  return input.sources?.map((source) => {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported source URL protocol: ${url.protocol}`);
    return { ...source, url: url.toString() };
  });
}

export function addAnnotation(state: ResearchState, input: AnnotationInput, actor: Actor): ResearchState {
  if (!state.document.anchors.some((anchor) => anchor.id === input.anchorId)) {
    throw new Error(`Unknown anchor: ${input.anchorId}`);
  }
  const relatedNodeIds = input.relatedNodeIds ?? [];
  if (relatedNodeIds.some((id) => !state.document.nodes.some((node) => node.id === id))) {
    throw new Error("Annotation references an unknown research node");
  }
  const annotation = {
    ...input,
    sources: validateAnnotationSources(input),
    relatedNodeIds,
    id: makeId("annotation"),
    createdBy: actor,
    createdAt: new Date().toISOString(),
    isCollapsed: false,
    isPinned: false,
  };
  const next = { ...state.document, annotations: [...state.document.annotations, annotation] };
  const label = input.type === "simplification"
    ? "Added a simplified layer"
    : input.type === "highlight"
      ? "Highlighted the article"
      : input.type === "verification"
        ? "Added claim verification"
        : "Added an inline explanation";
  return commitDocument(state, next, label, actor);
}

export function toggleAnnotation(state: ResearchState, annotationId: string): ResearchState {
  const next = {
    ...state.document,
    annotations: state.document.annotations.map((annotation) => annotation.id === annotationId
      ? { ...annotation, isCollapsed: !annotation.isCollapsed }
      : annotation),
  };
  return commitDocument(state, next, "Changed inline explanation visibility", "human");
}

export function removeAnnotation(state: ResearchState, annotationId: string): ResearchState {
  const next = {
    ...state.document,
    annotations: state.document.annotations.filter((annotation) => annotation.id !== annotationId),
  };
  return commitDocument(state, next, "Removed a Living Page layer", "human");
}

function descendantNodeIds(document: ResearchDocument, rootId: string) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of document.nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

function withoutNodeReferences(document: ResearchDocument, removedIds: Set<string>): ResearchDocument {
  return {
    ...document,
    nodes: document.nodes.filter((node) => !removedIds.has(node.id)),
    sources: document.sources.filter((source) => !removedIds.has(source.nodeId)),
    annotations: document.annotations.map((annotation) => ({
      ...annotation,
      relatedNodeIds: annotation.relatedNodeIds.filter((id) => !removedIds.has(id)),
    })),
    canvasView: {
      ...document.canvasView,
      focusedNodeIds: document.canvasView.focusedNodeIds.filter((id) => !removedIds.has(id)),
    },
  };
}

export function removeResearchNode(state: ResearchState, nodeId: string): ResearchState {
  if (!state.document.nodes.some((node) => node.id === nodeId)) return state;
  const removedIds = descendantNodeIds(state.document, nodeId);
  return commitDocument(
    state,
    withoutNodeReferences(state.document, removedIds),
    `Removed ${removedIds.size} research ${removedIds.size === 1 ? "card" : "cards"}`,
    "human",
  );
}

export function removeAnchor(state: ResearchState, anchorId: string): ResearchState {
  if (!state.document.anchors.some((anchor) => anchor.id === anchorId)) return state;
  const removedIds = new Set(state.document.nodes.filter((node) => node.anchorId === anchorId).map((node) => node.id));
  const cleaned = withoutNodeReferences(state.document, removedIds);
  return withLiveRequests(commitDocument(state, {
    ...cleaned,
    anchors: cleaned.anchors.filter((anchor) => anchor.id !== anchorId),
    annotations: cleaned.annotations.filter((annotation) => annotation.anchorId !== anchorId),
  }, "Removed an article anchor and its layers", "human"));
}

export function removeCanvasItem(state: ResearchState, itemId: string): ResearchState {
  const data = state.document.canvasView.data;
  const nextData = {
    ...data,
    diagram: data.diagram ? {
      nodes: data.diagram.nodes.filter((node) => node.id !== itemId),
      edges: data.diagram.edges.filter((edge) => edge.from !== itemId && edge.to !== itemId),
    } : undefined,
    timeline: data.timeline?.filter((item) => item.id !== itemId),
    comparison: data.comparison ? {
      ...data.comparison,
      rows: data.comparison.rows.filter((row, index) => (row.id ?? `row-${index}`) !== itemId),
    } : undefined,
    imageBoard: data.imageBoard?.filter((item) => item.id !== itemId),
    interactive: data.interactive?.id === itemId ? undefined : data.interactive,
    map: data.map ? {
      ...data.map,
      markers: data.map.markers.filter((marker) => marker.id !== itemId),
      focusMarkerId: data.map.focusMarkerId === itemId ? undefined : data.map.focusMarkerId,
    } : undefined,
  };
  return commitDocument(state, {
    ...state.document,
    canvasView: { ...state.document.canvasView, data: nextData, updatedAt: new Date().toISOString() },
  }, "Removed a visualization card", "human");
}

function validatedCanvasData(data: CanvasViewState["data"]) {
  const imageBoard = data.imageBoard?.map((item) => {
    const imageUrl = new URL(item.imageUrl);
    if (!['http:', 'https:'].includes(imageUrl.protocol)) throw new Error(`Unsupported image URL protocol: ${imageUrl.protocol}`);
    let sourceUrl: string | undefined;
    if (item.sourceUrl) {
      const parsed = new URL(item.sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported source URL protocol: ${parsed.protocol}`);
      sourceUrl = parsed.toString();
    }
    return { ...item, imageUrl: imageUrl.toString(), sourceUrl };
  });
  return {
    ...data,
    imageBoard,
    map: data.map ? validatedMapData(data.map) : undefined,
    interactive: data.interactive ? validatedInteractiveData(data.interactive) : undefined,
  };
}

/** A sandboxed widget is a page-sized document, not a bundle: it is capped and must be self-contained. */
export const MAX_INTERACTIVE_HTML_CHARACTERS = 60_000;

/**
 * The frame runs with no network of its own, so anything it would have to fetch is dead markup.
 * Refusing it here tells the agent why, instead of rendering a widget that silently fails.
 */
const EXTERNAL_RESOURCE = /<\s*(script|link|iframe|object|embed)\b[^>]*\b(src|href)\s*=\s*["']?\s*(https?:|\/\/)/i;

function validatedInteractiveData(view: InteractiveViewData): InteractiveViewData {
  const title = view.title?.trim();
  if (!title) throw new Error("An interactive canvas needs a title");
  const html = view.html ?? "";
  if (!html.trim()) throw new Error("An interactive canvas needs html to run");
  if (html.length > MAX_INTERACTIVE_HTML_CHARACTERS) {
    throw new Error(`An interactive canvas is limited to ${MAX_INTERACTIVE_HTML_CHARACTERS} characters of html`);
  }
  if (EXTERNAL_RESOURCE.test(html)) {
    throw new Error("An interactive canvas must be self-contained: its sandbox blocks external scripts, stylesheets, and frames");
  }
  return {
    id: view.id?.trim() || makeId("interactive"),
    title,
    html,
    note: view.note,
    sourceNodeIds: view.sourceNodeIds ?? [],
    updatedAt: new Date().toISOString(),
  };
}

const MAX_MAP_MARKERS = 250;

function validatedCoordinate(lat: unknown, lng: unknown, label: string) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`${label} needs a latitude between -90 and 90`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`${label} needs a longitude between -180 and 180`);
  }
  return { lat: latitude, lng: longitude };
}

function validatedMapData(map: MapViewData): MapViewData {
  const markers = map.markers ?? [];
  if (markers.length > MAX_MAP_MARKERS) throw new Error(`A map holds at most ${MAX_MAP_MARKERS} markers`);
  const seen = new Set<string>();
  const validated = markers.map((marker, index) => {
    const id = marker.id || `marker-${index}`;
    if (seen.has(id)) throw new Error(`Duplicate map marker id: ${id}`);
    seen.add(id);
    if (!marker.label?.trim()) throw new Error(`Map marker ${id} needs a label`);
    const { lat, lng } = validatedCoordinate(marker.lat, marker.lng, `Map marker ${id}`);
    let sourceUrl: string | undefined;
    if (marker.sourceUrl) {
      const parsed = new URL(marker.sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported source URL protocol: ${parsed.protocol}`);
      sourceUrl = parsed.toString();
    }
    return { ...marker, id, lat, lng, sourceUrl };
  });
  const center = map.center ? validatedCoordinate(map.center.lat, map.center.lng, "Map center") : undefined;
  const zoom = map.zoom === undefined ? undefined : Math.min(19, Math.max(1, Math.round(Number(map.zoom))));
  if (zoom !== undefined && !Number.isFinite(zoom)) throw new Error("Map zoom must be a number between 1 and 19");
  const focusMarkerId = map.focusMarkerId && seen.has(map.focusMarkerId) ? map.focusMarkerId : undefined;
  return { markers: validated, center, zoom, focusMarkerId };
}

export function setCanvasView(
  state: ResearchState,
  input: Partial<CanvasViewState> & Pick<CanvasViewState, "type">,
  actor: Actor,
): ResearchState {
  const nextView: CanvasViewState = {
    ...state.document.canvasView,
    ...input,
    focusedNodeIds: input.focusedNodeIds ?? state.document.canvasView.focusedNodeIds,
    filters: input.filters ?? state.document.canvasView.filters,
    visualConfig: input.visualConfig ?? state.document.canvasView.visualConfig,
    data: input.data ? validatedCanvasData(input.data) : state.document.canvasView.data,
    updatedAt: new Date().toISOString(),
  };
  return commitDocument(
    state,
    { ...state.document, canvasView: nextView },
    `Changed canvas to ${nextView.title}`,
    actor,
  );
}

function sourceFromInput(nodeId: string, input: SourceInput): ResearchSource {
  const sourceUrl = new URL(input.url);
  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    throw new Error(`Unsupported source URL protocol: ${sourceUrl.protocol}`);
  }
  return {
    id: makeId("source"),
    nodeId,
    title: input.title,
    url: sourceUrl.toString(),
    publisher: input.publisher,
    excerpt: input.excerpt,
    sourceType: input.sourceType ?? "other",
    contentType: input.contentType ?? "webpage",
    publishedAt: input.publishedAt,
    relevantLocation: input.relevantLocation,
  };
}

export function addNodes(
  state: ResearchState,
  anchorId: string,
  inputs: NodeInput[],
  label: string,
  actor: Actor,
): { state: ResearchState; nodes: ResearchNode[] } {
  if (!state.document.anchors.some((anchor) => anchor.id === anchorId)) {
    throw new Error(`Unknown anchor: ${anchorId}`);
  }
  if (inputs.length === 0) throw new Error("At least one node is required");

  const clientIds = new Map<string, string>();
  for (const input of inputs) {
    if (input.clientId) clientIds.set(input.clientId, makeId("node"));
  }

  const createdAt = new Date().toISOString();
  const created = inputs.map((input) => {
    const id = input.clientId ? clientIds.get(input.clientId)! : makeId("node");
    const parentId = input.parentId ? (clientIds.get(input.parentId) ?? input.parentId) : undefined;
    if (
      parentId
      && !state.document.nodes.some((node) => node.id === parentId && node.anchorId === anchorId)
      && ![...clientIds.values()].includes(parentId)
    ) {
      throw new Error(`Unknown parent node: ${input.parentId}`);
    }
    return {
      id,
      anchorId,
      parentId,
      type: input.type,
      contentType: input.contentType ?? "text",
      title: input.title.trim(),
      summary: input.summary.trim(),
      body: input.body?.trim(),
      createdBy: actor,
      createdAt,
      gapReason: input.gapReason?.trim(),
      isCollapsed: false,
    } satisfies ResearchNode;
  });

  const sources = inputs.flatMap((input, index) =>
    (input.sources ?? []).map((source) => sourceFromInput(created[index].id, source)),
  );
  const next: ResearchDocument = {
    ...state.document,
    nodes: [...state.document.nodes, ...created],
    sources: [...state.document.sources, ...sources],
  };
  return { state: commitDocument(state, next, label, actor), nodes: created };
}

export function addSource(
  state: ResearchState,
  nodeId: string,
  input: SourceInput,
  actor: Actor,
): ResearchState {
  if (!state.document.nodes.some((node) => node.id === nodeId)) throw new Error(`Unknown node: ${nodeId}`);
  const source = sourceFromInput(nodeId, input);
  const next = { ...state.document, sources: [...state.document.sources, source] };
  return commitDocument(state, next, `Added source: ${input.title}`, actor);
}

export function toggleNode(state: ResearchState, nodeId: string): ResearchState {
  const next = {
    ...state.document,
    nodes: state.document.nodes.map((node) =>
      node.id === nodeId ? { ...node, isCollapsed: !node.isCollapsed } : node,
    ),
  };
  return commitDocument(state, next, "Changed branch visibility", "human");
}

export function undo(state: ResearchState): ResearchState {
  const previous = state.undoStack.at(-1);
  if (!previous) return state;
  const redoEntry: HistoryEntry = {
    label: previous.label,
    actor: previous.actor,
    timestamp: new Date().toISOString(),
    document: snapshot(state.document),
  };
  return withLiveRequests({
    ...state,
    document: previous.document,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, redoEntry],
  });
}

export function redo(state: ResearchState): ResearchState {
  const next = state.redoStack.at(-1);
  if (!next) return state;
  const undoEntry: HistoryEntry = {
    label: next.label,
    actor: next.actor,
    timestamp: new Date().toISOString(),
    document: snapshot(state.document),
  };
  return withLiveRequests({
    ...state,
    document: next.document,
    undoStack: [...state.undoStack, undoEntry],
    redoStack: state.redoStack.slice(0, -1),
  });
}

export function loadState(): ResearchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as unknown as ResearchState;
    const storedVersion = (parsed.document as unknown as { version?: number } | undefined)?.version;
    if (storedVersion === 1) {
      const legacyDocument = parsed.document as unknown as Omit<ResearchDocument, "version" | "article">;
      const upgraded = {
        ...parsed,
        document: {
          ...legacyDocument,
          version: 3,
          article: structuredClone(defaultArticle),
          annotations: [],
          canvasView: emptyDocument().canvasView,
        },
      } as ResearchState;
      return normalizeResearchState(upgraded);
    }
    if (storedVersion === 2 && parsed.document.article) {
      const upgraded = {
        ...parsed,
        document: {
          ...parsed.document,
          version: 3,
          annotations: [],
          canvasView: emptyDocument().canvasView,
        },
        undoStack: [],
        redoStack: [],
      } as ResearchState;
      return normalizeResearchState(upgraded);
    }
    if (storedVersion !== 3 || !parsed.document.article) return emptyState();
    return normalizeResearchState(parsed);
  } catch {
    return emptyState();
  }
}
