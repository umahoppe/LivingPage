import { RotateCcw, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { focusCanvasCard } from "./canvas-focus";
import { setInteractiveState } from "./interactive-state";
import { MAX_INTERACTIVE_FRAME_HEIGHT } from "./model";
import { useResearch } from "./research-context";
import type { InteractiveViewData } from "./types";

/**
 * No network of any kind, no external assets, no form posts. Combined with a sandbox that
 * withholds allow-same-origin, the widget runs on an opaque origin: it cannot read this page's
 * DOM, localStorage, or cookies, and it cannot call anything out.
 */
const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const MAX_STATE_CHARACTERS = 4_000;
const INITIAL_FRAME_HEIGHT = 260;
const MIN_FRAME_HEIGHT = 140;

/**
 * The only channel out of the frame: a state value the reader produced, a request to open one
 * research card, plus layout and error reports. openCard is what a widget-drawn diagram or
 * comparison uses in place of the card click the host-drawn canvases used to provide.
 */
const FRAME_BRIDGE = `
(function () {
  function send(type, payload) {
    try {
      var message = { source: "livingpage-canvas", type: type };
      for (var key in payload) message[key] = payload[key];
      parent.postMessage(message, "*");
    } catch (error) { /* the parent is the only listener; a failure here is not the widget's problem */ }
  }
  window.livingPage = {
    setState: function (value) { send("state", { value: value }); },
    openCard: function (nodeId) { send("open-card", { nodeId: String(nodeId) }); },
  };
  function reportHeight() {
    send("height", { height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
  }
  window.addEventListener("load", reportHeight);
  window.addEventListener("resize", reportHeight);
  if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.documentElement);
  window.addEventListener("error", function (event) { send("error", { message: String(event.message).slice(0, 200) }); });
})();
`;

const FRAME_STYLES = `
  :root { color-scheme: light; }
  html { height: auto; }
  body {
    margin: 0; padding: 18px 19px 20px;
    font: 12px/1.5 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #37413a; background: #fbfaf6;
  }
  h1, h2, h3 { margin: 0 0 10px; font-size: 14px; color: #2f3a33; }
  p { margin: 0 0 10px; }
  button { font: inherit; cursor: pointer; border: 1px solid #c5d4c8; border-radius: 7px; background: #e5eee7; color: #386649; padding: 6px 11px; }
  input, select, textarea { font: inherit; }
  input[type="range"] { width: 100%; accent-color: #4b7459; }
  label { display: block; font-size: 10px; font-weight: 600; color: #6f776f; margin-bottom: 5px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border-bottom: 1px solid #e0e3dc; padding: 6px 8px; text-align: left; }
`;

function frameDocument(html: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`
    + `<style>${FRAME_STYLES}</style><script>${FRAME_BRIDGE}</script></head>`
    + `<body>${html}</body></html>`;
}

interface FrameMessage {
  source?: string;
  type?: string;
  value?: unknown;
  height?: unknown;
  message?: unknown;
  nodeId?: unknown;
}

/** Reader state has to survive a WebMCP read, so it must be plain data and stay small. */
function plainState(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return undefined;
    if (serialized.length > MAX_STATE_CHARACTERS) return undefined;
    return JSON.parse(serialized) as unknown;
  } catch {
    return undefined;
  }
}

export function InteractiveCanvasView({ data }: { data: InteractiveViewData }) {
  const { removeVisualizationCard } = useResearch();
  const [run, setRun] = useState(0);

  return (
    <div className="visualization interactive-view" data-canvas-type="interactive">
      <article className="interactive-card">
        <header className="interactive-head">
          <div>
            <strong>{data.title}</strong>
            {data.note && <p>{data.note}</p>}
          </div>
          <div className="interactive-actions">
            <button onClick={() => setRun((value) => value + 1)} aria-label={`Reset interactive canvas ${data.title}`}>
              <RotateCcw size={12} />Reset
            </button>
            <button
              className="visual-card-delete"
              onClick={() => removeVisualizationCard(data.id)}
              aria-label={`Remove interactive canvas ${data.title}`}
            >
              <X size={13} />
            </button>
          </div>
        </header>
        {/* A new key throws the frame away and builds it again, which is the whole of Reset. */}
        <InteractiveFrame key={`${data.id}-${data.updatedAt ?? ""}-${run}`} data={data} />
      </article>
    </div>
  );
}

function InteractiveFrame({ data }: { data: InteractiveViewData }) {
  const { state, setSelectedNodeId } = useResearch();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_FRAME_HEIGHT);
  const [stateLabel, setStateLabel] = useState<string>();
  const [frameError, setFrameError] = useState<string>();

  const srcDoc = useMemo(() => frameDocument(data.html), [data.html]);
  /** Read inside the message handler, so a new card does not tear the running widget down. */
  const nodesRef = useRef(state.document.nodes);
  useEffect(() => {
    nodesRef.current = state.document.nodes;
  }, [state.document.nodes]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const payload = event.data as FrameMessage;
      if (!payload || payload.source !== "livingpage-canvas") return;

      if (payload.type === "height") {
        const reported = Number(payload.height);
        if (!Number.isFinite(reported)) return;
        setHeight(Math.min(MAX_INTERACTIVE_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(reported))));
        return;
      }
      if (payload.type === "error") {
        setFrameError(String(payload.message ?? "").slice(0, 200));
        return;
      }
      if (payload.type === "open-card") {
        // The frame is untrusted, so it may only name a card that already exists on this page.
        const nodeId = String(payload.nodeId ?? "");
        if (!nodesRef.current.some((node) => node.id === nodeId)) {
          setFrameError(`This widget asked to open a research card that does not exist: ${nodeId.slice(0, 60)}`);
          return;
        }
        focusCanvasCard("interactive", { id: data.id, label: data.title, sourceNodeIds: data.sourceNodeIds });
        setSelectedNodeId(nodeId);
        return;
      }
      if (payload.type !== "state") return;

      const value = plainState(payload.value);
      if (value === undefined) {
        setFrameError(`This widget reported a state larger than ${MAX_STATE_CHARACTERS} characters, or one that is not plain data.`);
        return;
      }
      setInteractiveState({ canvasId: data.id, value, updatedAt: new Date().toISOString() });
      setStateLabel(JSON.stringify(value).slice(0, 120));
      focusCanvasCard("interactive", { id: data.id, label: data.title, sourceNodeIds: data.sourceNodeIds });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [data.id, data.title, data.sourceNodeIds, setSelectedNodeId]);

  /** Reader state belongs to the frame that is running, so it goes when the frame does. */
  useEffect(() => () => setInteractiveState(undefined), []);

  return (
    <>
      <iframe
        ref={frameRef}
        className="interactive-frame"
        title={data.title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{ height }}
      />
      <footer className="interactive-foot">
        <span className="interactive-sandbox-note">
          <ShieldCheck size={11} />Sandboxed: no network, no access to this page
        </span>
        {stateLabel && <code data-interactive-state>{stateLabel}</code>}
      </footer>
      {frameError && <p className="interactive-error">{frameError}</p>}
    </>
  );
}
