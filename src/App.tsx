import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileSearch,
  Flower2,
  GitBranch,
  History,
  Link2,
  Quote,
  Redo2,
  Search,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useResearch, type AnchorInput } from "./research-context";
import type { BranchType, ResearchAnchor, ResearchNode } from "./types";
import { useWebMCP } from "./webmcp";

interface ArticleBlock {
  id: string;
  kind: "p" | "h2" | "quote";
  text: string;
}

const articleBlocks: ArticleBlock[] = [
  {
    id: "opening",
    kind: "p",
    text: "The electric vehicle market has entered a more complicated phase. Global adoption continues to rise, but headline numbers can hide sharp differences between regions, price segments, and policy environments.",
  },
  {
    id: "claim-growth",
    kind: "quote",
    text: "Global EV sales increased by 20% year over year, suggesting the transition has regained momentum.",
  },
  {
    id: "market-context",
    kind: "p",
    text: "Lower battery costs, expanding model choice, and purchase incentives are frequently cited as the main drivers. Yet each explanation depends on where the boundary is drawn and which vehicles are counted.",
  },
  {
    id: "regional-gap",
    kind: "p",
    text: "Growth is not evenly distributed. Some markets accelerated after new subsidies, while others slowed as incentives expired and charging infrastructure lagged behind demand.",
  },
  {
    id: "questions-heading",
    kind: "h2",
    text: "A number is not yet an explanation",
  },
  {
    id: "research-need",
    kind: "p",
    text: "A useful reading of the market must connect the claim to primary data, explain the mechanism behind the change, and preserve credible counterpoints. Otherwise, a precise-looking statistic can create more confidence than understanding.",
  },
];

const branchMeta: Record<BranchType, { label: string; icon: typeof Search; tone: string }> = {
  verify: { label: "Verify", icon: ShieldCheck, tone: "blue" },
  why: { label: "Why?", icon: Search, tone: "amber" },
  counterpoint: { label: "Counterpoint", icon: GitBranch, tone: "rose" },
  primary_source: { label: "Primary source", icon: FileSearch, tone: "green" },
  data: { label: "Data", icon: CircleDot, tone: "violet" },
  background: { label: "Background", icon: History, tone: "slate" },
  summary: { label: "Synthesis", icon: Sparkles, tone: "green" },
  custom: { label: "Research", icon: Quote, tone: "slate" },
};

interface PendingSelection extends AnchorInput {
  x: number;
  y: number;
}

function textOffset(container: Node, target: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(target, offset);
  return range.toString().length;
}

function App() {
  const webMCPStatus = useWebMCP();
  const {
    state,
    activeAnchorId,
    selectedNode,
    activity,
    setActiveAnchorId,
    setSelectedNodeId,
    createAnchor,
    undo,
    redo,
  } = useResearch();
  const [pending, setPending] = useState<PendingSelection>();
  const articleRef = useRef<HTMLElement>(null);

  const handleSelection = useCallback(() => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setPending(undefined);
        return;
      }
      const quote = selection.toString().replace(/\s+/g, " ").trim();
      if (quote.length < 8 || quote.length > 360) return;
      const range = selection.getRangeAt(0);
      const startElement = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer as Element;
      const block = startElement?.closest<HTMLElement>("[data-block-id]");
      if (!block || !articleRef.current?.contains(block) || !block.contains(range.endContainer)) return;
      const fullText = block.textContent ?? "";
      const startOffset = textOffset(block, range.startContainer, range.startOffset);
      const endOffset = textOffset(block, range.endContainer, range.endOffset);
      const rect = range.getBoundingClientRect();
      setPending({
        blockId: block.dataset.blockId!,
        quote,
        prefix: fullText.slice(Math.max(0, startOffset - 48), startOffset),
        suffix: fullText.slice(endOffset, endOffset + 48),
        startOffset,
        endOffset,
        x: Math.min(window.innerWidth - 220, Math.max(16, rect.left + rect.width / 2 - 94)),
        y: Math.min(window.innerHeight - 54, Math.max(76, rect.bottom + 10)),
      });
    }, 0);
  }, []);

  const confirmAnchor = () => {
    if (!pending) return;
    createAnchor({
      blockId: pending.blockId,
      quote: pending.quote,
      prefix: pending.prefix,
      suffix: pending.suffix,
      startOffset: pending.startOffset,
      endOffset: pending.endOffset,
    });
    setPending(undefined);
    window.getSelection()?.removeAllRanges();
  };

  const statusCopy = {
    ready: "WebMCP connected",
    checking: "Checking WebMCP",
    unavailable: "Preview mode",
    error: "WebMCP error",
  }[webMCPStatus];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Flower2 size={18} strokeWidth={2.3} /></div>
          <div>
            <strong>Research Garden</strong>
            <span>Grow knowledge where you read</span>
          </div>
        </div>
        <div className="toolbar">
          <div className={`connection-status ${webMCPStatus}`}>
            <span className="status-dot" />
            {statusCopy}
          </div>
          <div className="toolbar-separator" />
          <button className="icon-button" onClick={undo} disabled={!state.undoStack.length} aria-label="Undo">
            <Undo2 size={17} />
          </button>
          <button className="icon-button" onClick={redo} disabled={!state.redoStack.length} aria-label="Redo">
            <Redo2 size={17} />
          </button>
          <div className="revision-pill">rev {state.document.revision}</div>
        </div>
      </header>

      <main className="workspace">
        <article className="article-pane" data-article ref={articleRef} onMouseUp={handleSelection}>
          <div className="article-inner">
            <div className="article-kicker">MOBILITY · MARKET SIGNALS</div>
            <h1>Is the electric vehicle transition accelerating again?</h1>
            <p className="article-deck">
              One optimistic number can carry several different stories. Select a claim to grow its evidence, causes, and counterpoints.
            </p>
            <div className="byline-row">
              <div className="author-avatar">RG</div>
              <div><strong>Research Garden Briefing</strong><span>September 1, 2026 · 6 min read</span></div>
            </div>
            <div className="hero-visual" aria-label="Abstract electric mobility data illustration">
              <div className="hero-grid" />
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <div className="hero-stat"><strong>20%</strong><span>CLAIM TO INVESTIGATE</span></div>
              <div className="hero-caption">A signal is the beginning of research, not the conclusion.</div>
            </div>
            <div className="article-body">
              {articleBlocks.map((block) => (
                <ArticleBlockView
                  key={block.id}
                  block={block}
                  anchors={state.document.anchors.filter((anchor) => anchor.blockId === block.id)}
                  activeAnchorId={activeAnchorId}
                  onAnchorClick={setActiveAnchorId}
                />
              ))}
            </div>
            <div className="article-end"><Flower2 size={19} /><span>End of briefing</span></div>
          </div>
        </article>

        <ResearchLayer />
      </main>

      {pending && (
        <button
          className="selection-action"
          style={{ left: pending.x, top: pending.y }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={confirmAnchor}
        >
          <Sparkles size={15} /> Grow research here
        </button>
      )}

      {activity && <div className="activity-toast"><Check size={15} />{activity}</div>}
      {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNodeId(undefined)} />}
    </div>
  );
}

function ArticleBlockView({
  block,
  anchors,
  activeAnchorId,
  onAnchorClick,
}: {
  block: ArticleBlock;
  anchors: ResearchAnchor[];
  activeAnchorId?: string;
  onAnchorClick: (id: string) => void;
}) {
  if (block.kind === "h2") return <h2 data-block-id={block.id}>{block.text}</h2>;
  if (!anchors.length) {
    const Tag = block.kind === "quote" ? "blockquote" : "p";
    return <Tag data-block-id={block.id}>{block.text}</Tag>;
  }

  const sorted = [...anchors].sort((a, b) => a.startOffset - b.startOffset);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const anchor of sorted) {
    parts.push(block.text.slice(cursor, anchor.startOffset));
    parts.push(
      <mark
        key={anchor.id}
        className={anchor.id === activeAnchorId ? "research-mark active" : "research-mark"}
        data-anchor-id={anchor.id}
        onClick={(event) => {
          event.stopPropagation();
          onAnchorClick(anchor.id);
        }}
      >
        {block.text.slice(anchor.startOffset, anchor.endOffset)}
        <span className="anchor-pin"><Link2 size={10} /></span>
      </mark>,
    );
    cursor = anchor.endOffset;
  }
  parts.push(block.text.slice(cursor));
  const Tag = block.kind === "quote" ? "blockquote" : "p";
  return <Tag data-block-id={block.id}>{parts}</Tag>;
}

function ResearchLayer() {
  const {
    state,
    activeAnchorId,
    setActiveAnchorId,
    setSelectedNodeId,
    addQuickBranch,
    toggleBranch,
  } = useResearch();

  return (
    <aside className="research-pane" aria-label="Research layer">
      <div className="research-header">
        <div>
          <div className="eyebrow"><GitBranch size={13} /> LIVE RESEARCH LAYER</div>
          <h2>Evidence grows from the text</h2>
        </div>
        <div className="layer-count">{state.document.anchors.length} anchors</div>
      </div>

      {!state.document.anchors.length ? (
        <div className="empty-layer">
          <div className="empty-illustration">
            <div className="empty-line line-a" />
            <div className="empty-line line-b" />
            <div className="empty-node node-a" />
            <div className="empty-node node-b" />
            <div className="empty-flower"><Flower2 size={27} /></div>
          </div>
          <div className="step-label">STEP 01</div>
          <h3>Select a claim in the article</h3>
          <p>Highlight a sentence on the left. Its evidence, explanations, and counterpoints will grow here without leaving the page.</p>
          <div className="agent-hint"><Bot size={16} /><span>Your agent can read and grow this layer through WebMCP.</span></div>
        </div>
      ) : (
        <div className="anchor-list">
          {state.document.anchors.map((anchor, index) => {
            const nodes = state.document.nodes.filter((node) => node.anchorId === anchor.id);
            const topNodes = nodes.filter((node) => !node.parentId);
            const isActive = anchor.id === activeAnchorId;
            return (
              <section key={anchor.id} className={`anchor-group ${isActive ? "active" : ""}`}>
                <button className="anchor-heading" onClick={() => setActiveAnchorId(anchor.id)}>
                  <span className="anchor-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="anchor-quote">“{anchor.quote}”</span>
                  <span className="anchor-node-count">{nodes.length}</span>
                </button>
                {isActive && (
                  <div className="anchor-content">
                    {topNodes.length ? (
                      <div className="branch-tree">
                        {topNodes.map((node) => (
                          <BranchNode
                            key={node.id}
                            node={node}
                            allNodes={nodes}
                            onSelect={setSelectedNodeId}
                            onToggle={toggleBranch}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="empty-anchor-copy">
                        <Sparkles size={17} />
                        <span>This anchor is ready. Ask your agent what the claim still needs.</span>
                      </div>
                    )}
                    <div className="quick-grow">
                      <span>Grow a branch</span>
                      <div>
                        <button onClick={() => addQuickBranch(anchor.id, "verify")}><ShieldCheck size={13} />Verify</button>
                        <button onClick={() => addQuickBranch(anchor.id, "why")}><Search size={13} />Why?</button>
                        <button onClick={() => addQuickBranch(anchor.id, "counterpoint")}><GitBranch size={13} />Counterpoint</button>
                      </div>
                    </div>
                    <div className="agent-prompt-card">
                      <Bot size={17} />
                      <div><strong>Ask your agent</strong><span>“What is missing from the research around this claim?”</span></div>
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function BranchNode({
  node,
  allNodes,
  onSelect,
  onToggle,
}: {
  node: ResearchNode;
  allNodes: ResearchNode[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { state } = useResearch();
  const children = allNodes.filter((candidate) => candidate.parentId === node.id);
  const sources = state.document.sources.filter((source) => source.nodeId === node.id);
  const meta = branchMeta[node.type];
  const Icon = meta.icon;

  return (
    <div className={`branch-node tone-${meta.tone}`}>
      <div className="branch-connector" />
      <button className="branch-card" onClick={() => onSelect(node.id)}>
        <div className="branch-card-top">
          <span className="branch-kind"><Icon size={13} />{meta.label}</span>
          <span className={`actor-badge ${node.createdBy}`}><Bot size={11} />{node.createdBy}</span>
        </div>
        <strong>{node.title}</strong>
        <p>{node.summary}</p>
        {node.gapReason && <div className="gap-reason"><Sparkles size={11} />Added because: {node.gapReason}</div>}
        <div className="branch-card-footer">
          <span><Link2 size={12} />{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
          {sources.slice(0, 2).map((source) => <span key={source.id} className="source-type">{source.sourceType}</span>)}
          {children.length > 0 && (
            <span
              className="collapse-control"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(node.id);
              }}
            >
              {node.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{children.length}
            </span>
          )}
        </div>
      </button>
      {!node.isCollapsed && children.length > 0 && (
        <div className="branch-children">
          {children.map((child) => (
            <BranchNode key={child.id} node={child} allNodes={allNodes} onSelect={onSelect} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDetail({ node, onClose }: { node: ResearchNode; onClose: () => void }) {
  const { state } = useResearch();
  const sources = state.document.sources.filter((source) => source.nodeId === node.id);
  const meta = branchMeta[node.type];
  const Icon = meta.icon;
  return (
    <div className="detail-backdrop" onMouseDown={onClose}>
      <section className="detail-panel" onMouseDown={(event) => event.stopPropagation()}>
        <button className="detail-close" onClick={onClose}><X size={17} /></button>
        <div className={`detail-kind tone-${meta.tone}`}><Icon size={14} />{meta.label}</div>
        <h2>{node.title}</h2>
        <p className="detail-summary">{node.summary}</p>
        {node.body && <p className="detail-body">{node.body}</p>}
        {node.gapReason && <div className="detail-gap"><Sparkles size={14} /><div><strong>Why the agent added this</strong><span>{node.gapReason}</span></div></div>}
        <div className="detail-divider" />
        <div className="detail-section-title"><span>Source provenance</span><span>{sources.length}</span></div>
        {sources.length ? (
          <div className="source-list">
            {sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="source-card">
                <div><span className="source-type">{source.sourceType}</span><span>{source.contentType}</span></div>
                <strong>{source.title}</strong>
                {source.publisher && <p>{source.publisher}</p>}
                {source.excerpt && <blockquote>“{source.excerpt}”</blockquote>}
                <span className="source-link">Open source <ArrowUpRight size={12} /></span>
              </a>
            ))}
          </div>
        ) : (
          <div className="no-sources"><Link2 size={18} /><span>No source attached yet. Ask the agent to find an exact URL.</span></div>
        )}
      </section>
    </div>
  );
}

export default App;
