# Living Page · Research Garden

**The web page adapts to how you want to understand it.**

Living Page is an agent-native layer for understanding the web. A person selects something in the article and an agent turns its answer into interface: an inline explanation, a simplified layer, a semantic highlight, a sourced verification, a research branch, or a visualization. Research Garden remains the deep-research mode inside that experience.

Public HTML articles can be imported by URL. The Sites Worker extracts readable headings, paragraphs, quotes, authorship, publication metadata, and a representative image into same-origin structured content. Scripts, forms, embeds, local-network targets, non-HTML resources, and oversized responses are rejected.

## Golden path

1. Import a public article URL, or use the built-in demo article.
2. Select a sentence and choose Explain, Simplify, Visualize, Research, or Verify.
3. The selection becomes a durable text anchor and the small command bar prepares an agent request.
4. A WebMCP-capable agent reads the live selection and visible page state, then updates the article or Visual Thinking Canvas.
5. Reframe the same research as Research, Diagram, Timeline, Comparison, or a sourced Image Board without changing the underlying sources.
6. Review provenance in place, open image previews, remove mistaken anchors or individual cards, or undo the complete operation.

## WebMCP tools

- `get_page_context` — reads the article, current selection, anchors, and graph revision.
- `get_current_selection` — reads the durable selection, surrounding text, position, and anchor.
- `get_visible_page_context` — reads the visible article text, active layers, focus, preview, and canvas type.
- `get_canvas_state` — reads visualization state independently from research data.
- `get_research_layer` — returns compact nodes and source provenance for one anchor or the whole layer.
- `create_research_nodes` — atomically creates a batch of linked research branches.
- `add_research_source` — attaches an exact source URL and provenance to a node.
- `insert_inline_explanation` — adds an explanation beside the original passage.
- `insert_simplified_layer` — adds reversible plain-language text without replacing the original.
- `add_highlight` — applies a restrained semantic highlight with a reason.
- `add_verification` — adds a cautious source-backed verification state.
- `create_visualization` / `update_visualization` — transforms and automatically opens the right canvas as Research, Diagram, Timeline, Comparison, or a sourced Image Board.

Read tools use `readOnlyHint` and `untrustedContentHint`. Research data, inline layers, and canvas state are stored separately but share the same reversible history and local persistence. Removing an anchor cascades through its inline layers, research cards, and sources; Undo restores the whole operation.

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

The end-to-end tests inject a browser-side WebMCP host, execute the actual registered tools, and verify inline explanation, simplification, highlight, sourced verification, visualization, visible branch creation, grouped Undo/Redo, persistence after reload, and browser console health.

The import tests verify URL safety checks, readable-content extraction, imported article persistence, and WebMCP context for the imported source.

## Browser support

The visual workspace works in any current desktop browser. Agent tool discovery requires a WebMCP-capable browser such as ChatGPT's in-app browser or a compatible Chrome build with WebMCP enabled.

## License

[MIT](./LICENSE)
