# Research Garden

**Don't open another tab. Grow the page.**

Research Garden is an agent-native research layer that grows directly from the text a person is reading. A human selects a claim; an agent reads the current page and its existing research structure through WebMCP, decides what evidence or perspective is missing, and writes new branches back into the same visible workspace.

## Core interaction

1. Select a sentence in the demo article.
2. Choose **Grow research here** to create a durable text anchor.
3. Ask a WebMCP-capable agent: “What is missing from the research around this claim?”
4. The agent calls `get_research_layer`, analyzes the current branches, and calls `create_research_nodes` with evidence, causes, and counterpoints.
5. Review sources in place or undo the complete agent operation in one step.

## WebMCP tools

- `get_page_context` — reads the article, current selection, anchors, and graph revision.
- `get_research_layer` — returns compact nodes and source provenance for one anchor or the whole layer.
- `create_research_nodes` — atomically creates a batch of linked research branches.
- `add_research_source` — attaches an exact source URL and provenance to a node.

Read tools use `readOnlyHint` and `untrustedContentHint`. Agent writes are revision-aware, recorded as one history operation, and reversible by the user.

## Local development

```bash
npm install
npm run dev
```

Run verification:

```bash
npm test
npm run test:e2e
npm run lint
npm run build
```

The end-to-end test injects a browser-side WebMCP host, executes the actual registered tools, verifies visible branch creation, source provenance, grouped Undo/Redo, persistence after reload, and browser console health.

## Browser support

The visual workspace works in any current desktop browser. Agent tool discovery requires a WebMCP-capable browser such as ChatGPT's in-app browser or a compatible Chrome build with WebMCP enabled.

## License

[MIT](./LICENSE)
