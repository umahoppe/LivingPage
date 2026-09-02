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
export type CanvasType =
  | "research_graph"
  | "diagram"
  | "timeline"
  | "comparison_table"
  | "image_board"
  | "map"
  | "interactive";

export interface ArticleLink {
  start: number;
  end: number;
  url: string;
}

export interface ArticleBlock {
  id: string;
  kind: "p" | "h2" | "quote";
  text: string;
  links?: ArticleLink[];
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
  /** Readers anchor by selecting. An agent may only derive anchors while working a queued request. */
  createdBy: Actor;
  /** The reader request an agent-derived anchor was created for. */
  requestId?: string;
}

export interface AnchorPassageInput {
  /** The pending request this anchor is derived for. Agents never anchor unprompted. */
  requestId: string;
  quote: string;
  blockId?: string;
  occurrence?: number;
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
  id?: string;
  label: string;
  values: string[];
  sourceNodeIds?: string[];
}

export interface ImageBoardItem {
  id: string;
  title: string;
  imageUrl: string;
  note?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  sourceNodeIds?: string[];
}

export interface MapMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  note?: string;
  kind?: "place" | "event" | "route_point" | "region" | "other";
  sourceUrl?: string;
  sourceLabel?: string;
  sourceNodeIds?: string[];
}

export interface MapViewData {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  focusMarkerId?: string;
}

export interface MapViewport {
  center: { lat: number; lng: number };
  zoom: number;
  bounds: { north: number; south: number; east: number; west: number };
  visibleMarkerIds: string[];
}

export interface InteractiveViewData {
  id: string;
  title: string;
  /** Self-contained markup, styles, and script. It runs in a sandboxed frame with no network and no access to this page. */
  html: string;
  note?: string;
  sourceNodeIds?: string[];
  updatedAt?: string;
}

/** What the reader did inside the sandboxed frame, reported by the widget itself. */
export interface InteractiveReaderState {
  canvasId: string;
  value: unknown;
  updatedAt: string;
}

export interface VisualizationData {
  diagram?: { nodes: DiagramNode[]; edges: DiagramEdge[] };
  timeline?: TimelineItem[];
  comparison?: { columns: string[]; rows: ComparisonRow[] };
  imageBoard?: ImageBoardItem[];
  map?: MapViewData;
  interactive?: InteractiveViewData;
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

export type RequestIntent =
  | "explain"
  | "simplify"
  | "visualize"
  | "compare"
  | "map"
  | "research"
  | "verify"
  | "custom";

export type RequestStatus = "pending" | "done" | "skipped";

export interface PendingRequest {
  id: string;
  /** null when the reader asked about the whole article instead of one passage. */
  anchorId: string | null;
  intent: RequestIntent;
  prompt: string;
  note?: string;
  createdAt: string;
  status: RequestStatus;
  resolvedAt?: string;
  resolutionSummary?: string;
  appliedTo: string[];
}

export interface RequestInput {
  anchorId?: string | null;
  intent: RequestIntent;
  prompt: string;
  note?: string;
}

export interface ResearchState {
  document: ResearchDocument;
  requests: PendingRequest[];
  queueReadAt?: string;
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
