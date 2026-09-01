import type {
  Actor,
  HistoryEntry,
  NodeInput,
  ResearchAnchor,
  ResearchDocument,
  ResearchNode,
  ResearchSource,
  ResearchState,
  SourceInput,
} from "./types";

export const STORAGE_KEY = "research-garden:v1";

export const emptyDocument = (): ResearchDocument => ({
  version: 1,
  revision: 0,
  anchors: [],
  nodes: [],
  sources: [],
});

export const emptyState = (): ResearchState => ({
  document: emptyDocument(),
  undoStack: [],
  redoStack: [],
});

export const makeId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const snapshot = (document: ResearchDocument): ResearchDocument => structuredClone(document);

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
    document: { ...nextDocument, revision: state.document.revision + 1 },
    undoStack: [...state.undoStack.slice(-29), history],
    redoStack: [],
  };
}

export function addAnchor(
  state: ResearchState,
  anchor: Omit<ResearchAnchor, "id" | "createdAt">,
): { state: ResearchState; anchor: ResearchAnchor } {
  const existing = state.document.anchors.find(
    (candidate) => candidate.blockId === anchor.blockId && candidate.quote === anchor.quote,
  );
  if (existing) return { state, anchor: existing };

  const created: ResearchAnchor = {
    ...anchor,
    id: makeId("anchor"),
    createdAt: new Date().toISOString(),
  };
  const next = {
    ...state.document,
    anchors: [...state.document.anchors, created],
  };
  return { state: commitDocument(state, next, "Created a research anchor", "human"), anchor: created };
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
  return {
    document: previous.document,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, redoEntry],
  };
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
  return {
    document: next.document,
    undoStack: [...state.undoStack, undoEntry],
    redoStack: state.redoStack.slice(0, -1),
  };
}

export function loadState(): ResearchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as ResearchState;
    if (parsed.document?.version !== 1) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}
