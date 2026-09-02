/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addAnnotation as addAnnotationToState,
  addAnchor as addAnchorToState,
  addNodes,
  addSource,
  clearResolvedRequests,
  enqueueRequest,
  loadState,
  markQueueRead,
  replaceArticle as replaceArticleInState,
  removeAnchor as removeAnchorFromState,
  removeAnnotation as removeAnnotationFromState,
  removeCanvasItem as removeCanvasItemFromState,
  removeRequest as removeRequestFromState,
  removeResearchNode as removeResearchNodeFromState,
  redo as redoState,
  resolveRequest as resolveRequestInState,
  STORAGE_KEY,
  setCanvasView as setCanvasViewInState,
  toggleAnnotation as toggleAnnotationInState,
  toggleNode,
  undo as undoState,
} from "./model";
import type {
  Actor,
  AnnotationInput,
  ArticleDocument,
  BranchType,
  CanvasViewState,
  NodeInput,
  PendingRequest,
  RequestInput,
  ResearchAnchor,
  ResearchNode,
  ResearchSource,
  ResearchState,
  SourceInput,
} from "./types";

export interface LiveSelection extends AnchorInput {
  selectionType: "text";
  associatedAnchorId?: string;
}

export interface AnchorInput {
  blockId: string;
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
}

export interface RequestResolution {
  status?: "done" | "skipped";
  summary?: string;
  appliedTo?: string[];
}

export interface CreateNodesCommand {
  anchorId: string;
  baseRevision?: number;
  operationId?: string;
  operationLabel?: string;
  nodes: NodeInput[];
}

interface ResearchContextValue {
  state: ResearchState;
  activeAnchorId?: string;
  selectedNode?: ResearchNode;
  activity?: string;
  currentSelection?: LiveSelection;
  setActiveAnchorId: (id: string) => void;
  setSelectedNodeId: (id?: string) => void;
  createAnchor: (input: AnchorInput) => ResearchAnchor;
  setCurrentSelection: (selection?: LiveSelection) => void;
  replaceArticle: (article: ArticleDocument) => void;
  createNodes: (command: CreateNodesCommand, actor: Actor) => ResearchNode[];
  addSourceToNode: (nodeId: string, source: SourceInput, actor: Actor) => void;
  addQuickBranch: (anchorId: string, type: BranchType) => void;
  toggleBranch: (nodeId: string) => void;
  addLivingAnnotation: (input: AnnotationInput, actor: Actor) => void;
  toggleLivingAnnotation: (annotationId: string) => void;
  removeLivingAnnotation: (annotationId: string) => void;
  removeResearchAnchor: (anchorId: string) => void;
  removeResearchCard: (nodeId: string) => void;
  removeVisualizationCard: (itemId: string) => void;
  changeCanvasView: (input: Partial<CanvasViewState> & Pick<CanvasViewState, "type">, actor: Actor) => void;
  queueRequest: (input: RequestInput) => PendingRequest;
  resolveQueuedRequest: (requestId: string, resolution: RequestResolution) => PendingRequest;
  removeQueuedRequest: (requestId: string) => void;
  clearResolvedQueue: () => void;
  undo: () => void;
  redo: () => void;
}

const ResearchContext = createContext<ResearchContextValue | null>(null);

const quickBranches: Record<"verify" | "why" | "counterpoint", Pick<NodeInput, "title" | "summary">> = {
  verify: {
    title: "Verify this claim",
    summary: "Find an official statistic or primary source that confirms the claim.",
  },
  why: {
    title: "What explains this?",
    summary: "Investigate the underlying causes and the conditions behind this statement.",
  },
  counterpoint: {
    title: "Look for exceptions",
    summary: "Find contrary evidence, regional differences, or a credible opposing view.",
  },
};

export function ResearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ResearchState>(loadState);
  const stateRef = useRef(state);
  const [activeAnchorId, setActiveAnchorId] = useState<string | undefined>(() => state.document.anchors[0]?.id);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activity, setActivity] = useState<string>();
  const [currentSelection, setCurrentSelection] = useState<LiveSelection>();
  const currentSelectionRef = useRef(currentSelection);
  const activityTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    currentSelectionRef.current = currentSelection;
  }, [currentSelection]);

  const flashActivity = useCallback((message: string) => {
    setActivity(message);
    if (activityTimer.current) window.clearTimeout(activityTimer.current);
    activityTimer.current = window.setTimeout(() => setActivity(undefined), 3200);
  }, []);

  useEffect(() => () => {
    if (activityTimer.current) window.clearTimeout(activityTimer.current);
  }, []);

  const createAnchor = useCallback((input: AnchorInput) => {
    const result = addAnchorToState(stateRef.current, input);
    stateRef.current = result.state;
    setState(result.state);
    setActiveAnchorId(result.anchor.id);
    flashActivity("Research anchor added");
    return result.anchor;
  }, [flashActivity]);

  const replaceArticle = useCallback((article: ArticleDocument) => {
    const next = replaceArticleInState(stateRef.current, article);
    stateRef.current = next;
    setState(next);
    setActiveAnchorId(undefined);
    setSelectedNodeId(undefined);
    flashActivity("Article imported into the garden");
  }, [flashActivity]);

  const createNodes = useCallback((command: CreateNodesCommand, actor: Actor) => {
    const current = stateRef.current;
    if (command.baseRevision !== undefined && command.baseRevision !== current.document.revision) {
      throw new Error(`Graph changed: expected revision ${command.baseRevision}, current ${current.document.revision}`);
    }
    const result = addNodes(
      current,
      command.anchorId,
      command.nodes,
      command.operationLabel || (actor === "agent" ? `Agent added ${command.nodes.length} research branches` : "Added research branch"),
      actor,
    );
    stateRef.current = result.state;
    setState(result.state);
    setActiveAnchorId(command.anchorId);
    if (actor === "agent") window.dispatchEvent(new CustomEvent("livingpage:open-layers"));
    flashActivity(actor === "agent" ? `Agent added ${result.nodes.length} branches` : "Research branch added");
    return result.nodes;
  }, [flashActivity]);

  const addSourceToNode = useCallback((nodeId: string, source: SourceInput, actor: Actor) => {
    const next = addSource(stateRef.current, nodeId, source, actor);
    stateRef.current = next;
    setState(next);
    flashActivity(actor === "agent" ? "Agent attached a source" : "Source attached");
  }, [flashActivity]);

  const addQuickBranch = useCallback((anchorId: string, type: BranchType) => {
    if (!(type in quickBranches)) return;
    const preset = quickBranches[type as keyof typeof quickBranches];
    createNodes({ anchorId, nodes: [{ type, ...preset }] }, "human");
  }, [createNodes]);

  const toggleBranch = useCallback((nodeId: string) => {
    const next = toggleNode(stateRef.current, nodeId);
    stateRef.current = next;
    setState(next);
  }, []);

  const addLivingAnnotation = useCallback((input: AnnotationInput, actor: Actor) => {
    const next = addAnnotationToState(stateRef.current, input, actor);
    stateRef.current = next;
    setState(next);
    setActiveAnchorId(input.anchorId);
    if (actor === "agent") window.dispatchEvent(new CustomEvent("livingpage:open-layers"));
    flashActivity(actor === "agent" ? "Agent updated the Living Page" : "Living Page updated");
  }, [flashActivity]);

  const toggleLivingAnnotation = useCallback((annotationId: string) => {
    const next = toggleAnnotationInState(stateRef.current, annotationId);
    stateRef.current = next;
    setState(next);
  }, []);

  const removeLivingAnnotation = useCallback((annotationId: string) => {
    const next = removeAnnotationFromState(stateRef.current, annotationId);
    stateRef.current = next;
    setState(next);
    flashActivity("Living Page layer removed");
  }, [flashActivity]);

  const removeResearchAnchor = useCallback((anchorId: string) => {
    const next = removeAnchorFromState(stateRef.current, anchorId);
    stateRef.current = next;
    setState(next);
    setActiveAnchorId(next.document.anchors[0]?.id);
    setSelectedNodeId(undefined);
    setCurrentSelection((selection) => selection?.associatedAnchorId === anchorId ? undefined : selection);
    flashActivity("Anchor and related content removed");
  }, [flashActivity]);

  const removeResearchCard = useCallback((nodeId: string) => {
    const next = removeResearchNodeFromState(stateRef.current, nodeId);
    stateRef.current = next;
    setState(next);
    setSelectedNodeId(undefined);
    flashActivity("Research card removed");
  }, [flashActivity]);

  const removeVisualizationCard = useCallback((itemId: string) => {
    const next = removeCanvasItemFromState(stateRef.current, itemId);
    stateRef.current = next;
    setState(next);
    flashActivity("Visualization card removed");
  }, [flashActivity]);

  const changeCanvasView = useCallback((input: Partial<CanvasViewState> & Pick<CanvasViewState, "type">, actor: Actor) => {
    const next = setCanvasViewInState(stateRef.current, input, actor);
    stateRef.current = next;
    setState(next);
    if (actor === "agent") window.dispatchEvent(new CustomEvent("livingpage:open-canvas"));
    flashActivity(actor === "agent" ? "Agent transformed the canvas" : "Canvas view changed");
  }, [flashActivity]);

  const queueRequest = useCallback((input: RequestInput) => {
    const result = enqueueRequest(stateRef.current, input);
    stateRef.current = result.state;
    setState(result.state);
    setActiveAnchorId(input.anchorId);
    window.dispatchEvent(new CustomEvent("livingpage:open-queue"));
    flashActivity("Added to the request queue");
    return result.request;
  }, [flashActivity]);

  const resolveQueuedRequest = useCallback((requestId: string, resolution: RequestResolution) => {
    const result = resolveRequestInState(stateRef.current, requestId, resolution);
    stateRef.current = result.state;
    setState(result.state);
    window.dispatchEvent(new CustomEvent("livingpage:open-queue"));
    const remaining = result.state.requests.filter((request) => request.status === "pending").length;
    flashActivity(remaining
      ? `Agent resolved a request · ${remaining} left in the queue`
      : "Agent cleared the request queue");
    return result.request;
  }, [flashActivity]);

  const removeQueuedRequest = useCallback((requestId: string) => {
    const next = removeRequestFromState(stateRef.current, requestId);
    stateRef.current = next;
    setState(next);
    flashActivity("Request removed from the queue");
  }, [flashActivity]);

  const clearResolvedQueue = useCallback(() => {
    const next = clearResolvedRequests(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const noteQueueRead = useCallback(() => {
    const next = markQueueRead(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const undo = useCallback(() => {
    const next = undoState(stateRef.current);
    stateRef.current = next;
    setState(next);
    setSelectedNodeId(undefined);
    flashActivity("Last change undone");
  }, [flashActivity]);

  const redo = useCallback(() => {
    const next = redoState(stateRef.current);
    stateRef.current = next;
    setState(next);
    setSelectedNodeId(undefined);
    flashActivity("Change restored");
  }, [flashActivity]);

  const selectedNode = state.document.nodes.find((node) => node.id === selectedNodeId);
  const value = useMemo<ResearchContextValue>(() => ({
    state,
    activeAnchorId,
    selectedNode,
    activity,
    currentSelection,
    setActiveAnchorId,
    setSelectedNodeId,
    createAnchor,
    setCurrentSelection,
    replaceArticle,
    createNodes,
    addSourceToNode,
    addQuickBranch,
    toggleBranch,
    addLivingAnnotation,
    toggleLivingAnnotation,
    removeLivingAnnotation,
    removeResearchAnchor,
    removeResearchCard,
    removeVisualizationCard,
    changeCanvasView,
    queueRequest,
    resolveQueuedRequest,
    removeQueuedRequest,
    clearResolvedQueue,
    undo,
    redo,
  }), [
    state,
    activeAnchorId,
    selectedNode,
    activity,
    currentSelection,
    createAnchor,
    replaceArticle,
    createNodes,
    addSourceToNode,
    addQuickBranch,
    toggleBranch,
    addLivingAnnotation,
    toggleLivingAnnotation,
    removeLivingAnnotation,
    removeResearchAnchor,
    removeResearchCard,
    removeVisualizationCard,
    changeCanvasView,
    queueRequest,
    resolveQueuedRequest,
    removeQueuedRequest,
    clearResolvedQueue,
    undo,
    redo,
  ]);

  useEffect(() => {
    window.researchGarden = {
      getState: () => stateRef.current,
      getSelection: () => currentSelectionRef.current,
      createNodes: (command) => createNodes(command, "agent"),
      addSource: (nodeId, source) => addSourceToNode(nodeId, source, "agent"),
      addAnnotation: (input) => addLivingAnnotation(input, "agent"),
      setCanvasView: (input) => changeCanvasView(input, "agent"),
      markQueueRead: noteQueueRead,
      resolveRequest: (requestId, resolution) => resolveQueuedRequest(requestId, resolution),
    };
    return () => {
      delete window.researchGarden;
    };
  }, [createNodes, addSourceToNode, addLivingAnnotation, changeCanvasView, noteQueueRead, resolveQueuedRequest]);

  return <ResearchContext.Provider value={value}>{children}</ResearchContext.Provider>;
}

export function useResearch() {
  const context = useContext(ResearchContext);
  if (!context) throw new Error("useResearch must be used within ResearchProvider");
  return context;
}

declare global {
  interface Window {
    researchGarden?: {
      getState: () => ResearchState;
      getSelection: () => LiveSelection | undefined;
      createNodes: (command: CreateNodesCommand) => ResearchNode[];
      addSource: (nodeId: string, source: SourceInput) => void;
      addAnnotation: (input: AnnotationInput) => void;
      setCanvasView: (input: Partial<CanvasViewState> & Pick<CanvasViewState, "type">) => void;
      markQueueRead: () => void;
      resolveRequest: (requestId: string, resolution: RequestResolution) => PendingRequest;
    };
  }
}

export type { ResearchSource };
