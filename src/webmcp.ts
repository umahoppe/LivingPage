import { useEffect, useState } from "react";
import type { NodeInput, ResearchState, SourceInput } from "./types";

type WebMCPStatus = "checking" | "ready" | "unavailable" | "error";

interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

interface ModelContext {
  registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

const toolResult = (value: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

function compactLayer(state: ResearchState, anchorId?: string) {
  const anchors = state.document.anchors.filter((anchor) => !anchorId || anchor.id === anchorId);
  const ids = new Set(anchors.map((anchor) => anchor.id));
  const nodes = state.document.nodes.filter((node) => ids.has(node.anchorId));
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    revision: state.document.revision,
    anchors: anchors.map(({ id, blockId, quote }) => ({ id, blockId, quote })),
    nodes: nodes.map(({ id, anchorId: owner, parentId, type, title, summary, gapReason, createdBy }) => ({
      id,
      anchorId: owner,
      parentId,
      type,
      title,
      summary,
      gapReason,
      createdBy,
      sourceCount: state.document.sources.filter((source) => source.nodeId === id).length,
    })),
    sources: state.document.sources
      .filter((source) => nodeIds.has(source.nodeId))
      .map(({ id, nodeId, title, url, publisher, sourceType, contentType, excerpt }) => ({
        id,
        nodeId,
        title,
        url,
        publisher,
        sourceType,
        contentType,
        excerpt: excerpt?.slice(0, 240),
      })),
  };
}

function getPageContext() {
  const article = document.querySelector("[data-article]");
  const selection = window.getSelection();
  const state = window.researchGarden?.getState();
  return {
    pageTitle: document.title,
    pageUrl: location.href,
    articleId: state?.document.article.id,
    articleSourceUrl: state?.document.article.sourceUrl,
    articleSiteName: state?.document.article.siteName,
    articleTitle: article?.querySelector("h1")?.textContent?.trim(),
    articleContent: article?.textContent?.replace(/\s+/g, " ").trim().slice(0, 5000),
    selectedText: selection && !selection.isCollapsed ? selection.toString().trim() : "",
    anchors: state?.document.anchors.map(({ id, blockId, quote }) => ({ id, blockId, quote })) ?? [],
    graphRevision: state?.document.revision ?? 0,
  };
}

function requireBridge() {
  if (!window.researchGarden) throw new Error("Research Garden is still initializing");
  return window.researchGarden;
}

export function useWebMCP(): WebMCPStatus {
  const [status, setStatus] = useState<WebMCPStatus>(() => document.modelContext ? "checking" : "unavailable");

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const definitions: ToolDefinition[] = [
      {
        name: "get_page_context",
        title: "Read page context",
        description: "Read the current article, text selection, research anchors, and graph revision before researching a claim.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolResult(getPageContext()),
      },
      {
        name: "get_research_layer",
        title: "Read research layer",
        description: "Read compact nodes and sources attached to one text anchor or the full current research layer. Use this to find missing perspectives.",
        inputSchema: {
          type: "object",
          properties: {
            anchorId: { type: "string", description: "Optional anchor ID. Omit to read every anchor." },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async ({ anchorId }) => toolResult(compactLayer(requireBridge().getState(), anchorId as string | undefined)),
      },
      {
        name: "create_research_nodes",
        title: "Grow research branches",
        description: "Atomically add one or more evidence, explanation, or counterpoint branches to a text anchor. Include source provenance when available.",
        inputSchema: {
          type: "object",
          required: ["anchorId", "nodes"],
          properties: {
            anchorId: { type: "string", description: "The text anchor to grow." },
            baseRevision: { type: "number", description: "Graph revision read before this write." },
            operationId: { type: "string", description: "Stable ID for this agent operation." },
            operationLabel: { type: "string", description: "Short human-readable history label." },
            nodes: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                required: ["type", "title", "summary"],
                properties: {
                  clientId: { type: "string", description: "Optional temporary ID for child references in this batch." },
                  parentId: { type: "string", description: "Existing node ID or a clientId from this batch." },
                  type: {
                    type: "string",
                    enum: ["verify", "why", "counterpoint", "primary_source", "data", "background", "summary", "custom"],
                  },
                  contentType: { type: "string", enum: ["text", "webpage", "image", "pdf", "table"] },
                  title: { type: "string", maxLength: 100 },
                  summary: { type: "string", maxLength: 420 },
                  body: { type: "string", maxLength: 1800 },
                  gapReason: { type: "string", maxLength: 220 },
                  sources: {
                    type: "array",
                    maxItems: 5,
                    items: {
                      type: "object",
                      required: ["title", "url"],
                      properties: {
                        title: { type: "string" },
                        url: { type: "string" },
                        publisher: { type: "string" },
                        excerpt: { type: "string" },
                        sourceType: { type: "string", enum: ["primary", "official", "academic", "news", "community", "secondary", "other"] },
                        contentType: { type: "string", enum: ["webpage", "image", "pdf", "dataset"] },
                        publishedAt: { type: "string" },
                        relevantLocation: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const nodes = requireBridge().createNodes({
            anchorId: input.anchorId as string,
            baseRevision: input.baseRevision as number | undefined,
            operationId: input.operationId as string | undefined,
            operationLabel: input.operationLabel as string | undefined,
            nodes: input.nodes as NodeInput[],
          });
          return toolResult({ ok: true, createdNodeIds: nodes.map((node) => node.id), count: nodes.length });
        },
      },
      {
        name: "add_research_source",
        title: "Attach source provenance",
        description: "Attach an exact source URL and provenance metadata to an existing research node.",
        inputSchema: {
          type: "object",
          required: ["nodeId", "title", "url"],
          properties: {
            nodeId: { type: "string" },
            title: { type: "string" },
            url: { type: "string" },
            publisher: { type: "string" },
            excerpt: { type: "string" },
            sourceType: { type: "string", enum: ["primary", "official", "academic", "news", "community", "secondary", "other"] },
            contentType: { type: "string", enum: ["webpage", "image", "pdf", "dataset"] },
            publishedAt: { type: "string" },
            relevantLocation: { type: "string" },
          },
          additionalProperties: false,
        },
        execute: async ({ nodeId, ...source }) => {
          requireBridge().addSource(nodeId as string, source as unknown as SourceInput);
          return toolResult({ ok: true, nodeId });
        },
      },
    ];

    Promise.all(definitions.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })))
      .then(() => setStatus("ready"))
      .catch((error: unknown) => {
        console.error("WebMCP registration failed", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return status;
}
