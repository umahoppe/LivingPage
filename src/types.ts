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

export type LivingAnnotationType = "explanation" | "simplification" | "highlight" | "verification" | "images";
export type HighlightType = "important" | "claim" | "data" | "evidence" | "uncertain";
export type VerificationStatus = "supported" | "mixed" | "unsupported" | "uncertain";
/**
 * The canvas is one surface, not a set of tabs. Everything an agent can draw with text and
 * markup — a diagram, a timeline, a comparison — is an Interactive widget it writes itself.
 * A Map stays host-drawn because the sandbox blocks the network its tiles come from.
 */
export type CanvasType = "map" | "interactive";

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
  /**
   * A script-free, article-only rendering of the imported page. Blocks and this markup are
   * produced from the same Readability DOM, so data-rg-block-id text stays anchor-compatible.
   */
  snapshotHtml?: string;
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
  /** Set on an "images" layer: the pictures shown beside the passage, in the order the agent sent them. */
  images?: AnnotationImage[];
  relatedNodeIds: string[];
  createdBy: Actor;
  createdAt: string;
  isCollapsed: boolean;
  isPinned: boolean;
}

/**
 * A picture lives beside the passage it belongs to, not on the canvas: the reader wants to
 * look at it while reading. The sandbox blocks external images, so the host draws these.
 */
export interface AnnotationImage {
  id: string;
  title: string;
  imageUrl: string;
  note?: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface AnnotationImageInput {
  title: string;
  imageUrl: string;
  note?: string;
  sourceUrl?: string;
  sourceLabel?: string;
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
  map?: MapViewData;
  interactive?: InteractiveViewData;
}

export interface CanvasViewState {
  type: CanvasType;
  title: string;
  /** Article passages explicitly represented by this one canvas result. */
  sourceAnchorIds: string[];
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

/**
 * One visual intent, not four. Whether the answer is a diagram, a table, a map, or a widget
 * the reader can operate is the agent's call; the reader narrows it in the ask bar.
 */
export type RequestIntent =
  | "explain"
  | "simplify"
  | "visualize"
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
  images?: AnnotationImageInput[];
  relatedNodeIds?: string[];
}
