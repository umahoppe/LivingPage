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
  addAnchor as addAnchorToState,
  addNodes,
  addSource,
  loadState,
  replaceArticle as replaceArticleInState,
  redo as redoState,
  STORAGE_KEY,
  toggleNode,
  undo as undoState,
} from "./model";
import type {
  Actor,
  ArticleDocument,
  BranchType,
  NodeInput,
  ResearchAnchor,
  ResearchNode,
  ResearchSource,
  ResearchState,
  SourceInput,
} from "./types";

export interface AnchorInput {
  blockId: string;
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
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
  setActiveAnchorId: (id: string) => void;
  setSelectedNodeId: (id?: string) => void;
  createAnchor: (input: AnchorInput) => ResearchAnchor;
  replaceArticle: (article: ArticleDocument) => void;
  createNodes: (command: CreateNodesCommand, actor: Actor) => ResearchNode[];
  addSourceToNode: (nodeId: string, source: SourceInput, actor: Actor) => void;
  addQuickBranch: (anchorId: string, type: BranchType) => void;
  toggleBranch: (nodeId: string) => void;
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
  const activityTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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
    setActiveAnchorId,
    setSelectedNodeId,
    createAnchor,
    replaceArticle,
    createNodes,
    addSourceToNode,
    addQuickBranch,
    toggleBranch,
    undo,
    redo,
  }), [
    state,
    activeAnchorId,
    selectedNode,
    activity,
    createAnchor,
    replaceArticle,
    createNodes,
    addSourceToNode,
    addQuickBranch,
    toggleBranch,
    undo,
    redo,
  ]);

  useEffect(() => {
    window.researchGarden = {
      getState: () => stateRef.current,
      createNodes: (command) => createNodes(command, "agent"),
      addSource: (nodeId, source) => addSourceToNode(nodeId, source, "agent"),
    };
    return () => {
      delete window.researchGarden;
    };
  }, [createNodes, addSourceToNode]);

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
      createNodes: (command: CreateNodesCommand) => ResearchNode[];
      addSource: (nodeId: string, source: SourceInput) => void;
    };
  }
}

export type { ResearchSource };
