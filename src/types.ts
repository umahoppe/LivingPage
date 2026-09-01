export type BranchType =
  | "verify"
  | "why"
  | "counterpoint"
  | "primary_source"
  | "data"
  | "background"
  | "summary"
  | "custom";

export type ContentType = "text" | "webpage" | "image" | "pdf" | "table";
export type Actor = "human" | "agent";

export type LivingAnnotationType = "explanation" | "simplification" | "highlight" | "verification";
export type HighlightType = "important" | "claim" | "data" | "evidence" | "uncertain";
export type VerificationStatus = "supported" | "mixed" | "unsupported" | "uncertain";
export type CanvasType = "research_graph" | "diagram" | "timeline" | "comparison_table";

export interface ArticleBlock {
  id: string;
  kind: "p" | "h2" | "quote";
  text: string;
}

export interface ArticleDocument {
  id: string;
  title: string;
  deck: string;
  author: string;
  publishedAt?: string;
  sourceUrl?: string;
  siteName: string;
  heroImageUrl?: string;
  importedAt?: string;
  blocks: ArticleBlock[];
}

export interface ResearchAnchor {
  id: string;
  blockId: string;
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  createdAt: string;
}

export interface ResearchSource {
  id: string;
  nodeId: string;
  title: string;
  url: string;
  publisher?: string;
  excerpt?: string;
  sourceType: "primary" | "official" | "academic" | "news" | "community" | "secondary" | "other";
  contentType: "webpage" | "image" | "pdf" | "dataset";
  publishedAt?: string;
  relevantLocation?: string;
}

export interface AnnotationSource {
  title: string;
  url: string;
  publisher?: string;
  sourceType?: ResearchSource["sourceType"];
}

export interface LivingAnnotation {
  id: string;
  anchorId: string;
  type: LivingAnnotationType;
  title?: string;
  content?: string;
  level?: string;
  highlightType?: HighlightType;
  reason?: string;
  status?: VerificationStatus;
  sources?: AnnotationSource[];
  relatedNodeIds: string[];
  createdBy: Actor;
  createdAt: string;
  isCollapsed: boolean;
  isPinned: boolean;
}

export interface DiagramNode {
  id: string;
  label: string;
  description?: string;
  sourceNodeIds?: string[];
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface TimelineItem {
  id: string;
  date: string;
  title: string;
  description?: string;
  sourceNodeIds?: string[];
}

export interface ComparisonRow {
  label: string;
  values: string[];
  sourceNodeIds?: string[];
}

export interface VisualizationData {
  diagram?: { nodes: DiagramNode[]; edges: DiagramEdge[] };
  timeline?: TimelineItem[];
  comparison?: { columns: string[]; rows: ComparisonRow[] };
}

export interface CanvasViewState {
  type: CanvasType;
  title: string;
  focusedNodeIds: string[];
  layout: string;
  filters: string[];
  visualConfig: Record<string, string | number | boolean>;
  data: VisualizationData;
  updatedAt?: string;
}

export interface ResearchNode {
  id: string;
  anchorId: string;
  parentId?: string;
  type: BranchType;
  contentType: ContentType;
  title: string;
  summary: string;
  body?: string;
  createdBy: Actor;
  createdAt: string;
  gapReason?: string;
  isCollapsed: boolean;
}

export interface ResearchDocument {
  version: 3;
  revision: number;
  article: ArticleDocument;
  anchors: ResearchAnchor[];
  nodes: ResearchNode[];
  sources: ResearchSource[];
  annotations: LivingAnnotation[];
  canvasView: CanvasViewState;
}

export interface HistoryEntry {
  label: string;
  actor: Actor;
  timestamp: string;
  document: ResearchDocument;
}

export interface ResearchState {
  document: ResearchDocument;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export interface SourceInput {
  title: string;
  url: string;
  publisher?: string;
  excerpt?: string;
  sourceType?: ResearchSource["sourceType"];
  contentType?: ResearchSource["contentType"];
  publishedAt?: string;
  relevantLocation?: string;
}

export interface NodeInput {
  clientId?: string;
  parentId?: string;
  type: BranchType;
  contentType?: ContentType;
  title: string;
  summary: string;
  body?: string;
  gapReason?: string;
  sources?: SourceInput[];
}

export interface AnnotationInput {
  anchorId: string;
  type: LivingAnnotationType;
  title?: string;
  content?: string;
  level?: string;
  highlightType?: HighlightType;
  reason?: string;
  status?: VerificationStatus;
  sources?: AnnotationSource[];
  relatedNodeIds?: string[];
}
