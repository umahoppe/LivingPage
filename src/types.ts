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
  version: 2;
  revision: number;
  article: ArticleDocument;
  anchors: ResearchAnchor[];
  nodes: ResearchNode[];
  sources: ResearchSource[];
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
