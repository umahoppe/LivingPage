import type {
  Actor,
  ArticleDocument,
  HistoryEntry,
  NodeInput,
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
  version: 2,
  revision: 0,
  article: structuredClone(defaultArticle),
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

export function normalizeResearchState(state: ResearchState): ResearchState {
  return {
    document: normalizeDocumentBlockIds(state.document),
    undoStack: state.undoStack.map((entry) => ({ ...entry, document: normalizeDocumentBlockIds(entry.document) })),
    redoStack: state.redoStack.map((entry) => ({ ...entry, document: normalizeDocumentBlockIds(entry.document) })),
  };
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

export function replaceArticle(state: ResearchState, article: ArticleDocument): ResearchState {
  const next = normalizeDocumentBlockIds({
    version: 2,
    revision: state.document.revision,
    article: structuredClone(article),
    anchors: [],
    nodes: [],
    sources: [],
  });
  return commitDocument(state, next, `Imported article: ${article.title}`, "human");
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
    const parsed = JSON.parse(raw) as unknown as ResearchState;
    const storedVersion = (parsed.document as unknown as { version?: number } | undefined)?.version;
    if (storedVersion === 1) {
      const legacyDocument = parsed.document as unknown as Omit<ResearchDocument, "version" | "article">;
      return normalizeResearchState({
        ...parsed,
        document: {
          ...legacyDocument,
          version: 2,
          article: structuredClone(defaultArticle),
        },
      });
    }
    if (storedVersion !== 2 || !parsed.document.article) return emptyState();
    return normalizeResearchState(parsed);
  } catch {
    return emptyState();
  }
}
