# Living Page · Research Garden

**The web page adapts to how you want to understand it.**

Living Page is an agent-native layer for understanding the web. A person selects something in the article and an agent turns its answer into interface: an inline explanation, a simplified layer, a semantic highlight, a sourced verification, a research branch, or a visualization. Research Garden remains the deep-research mode inside that experience.

Public HTML articles can be imported by URL. The Sites Worker extracts readable headings, paragraphs, quotes, authorship, publication metadata, and a representative image into same-origin structured content. Scripts, forms, embeds, local-network targets, non-HTML resources, and oversized responses are rejected.

Links inside an imported article stay readable. Every `<a href>` is resolved against the article's own base URL and kept as an offset range in the block text, so a click opens the linked page in a side reader — same extraction, same safety checks — without touching the research layer. The reader follows further links with a back step, offers the original in a new tab, and can promote the linked page to the main article.

## Golden path

1. Import a public article URL, or use the built-in demo article.
2. Select a sentence and choose Explain, Simplify, Visualize, Map, Research, or Verify. Follow any in-article link in the side reader when the source itself answers the question.
3. The selection becomes a durable text anchor and the choice lands in the in-page **request queue** — nothing is copied to the clipboard, and nothing is sent yet. Keep reading and mark as many passages as you like; the ask bar adds free-text requests for anything the presets do not cover.
4. Say one sentence in your agent chat — *Process my marks.* A WebMCP-capable agent reads the whole queue, works through it in the order you marked it, and updates the article or Visual Thinking Canvas.
5. Reframe the same research as Research, Diagram, Timeline, Comparison, a sourced Image Board, or a Map of the places involved — without changing the underlying sources.
6. Track every anchored passage in the Layers tab — inline explanations, simplifications, highlights, verifications, and research cards all stay listed with the passage they belong to, and selecting one scrolls the article back to it.
7. Review provenance in place, open image previews, remove mistaken anchors or individual cards, or undo the complete operation.

## Request queue

The selection menu does not produce a message for you to carry. Every pick appends a request to a queue that lives on the page: intent, the anchored quote and its surrounding context, and the prompt. You read at your own pace, marking Explain here and Verify there, and the chat round trip collapses into a single sentence at the end.

The agent then drives the whole batch itself. `get_pending_requests` returns the queue in order — each entry with its `requestId`, `anchorId`, exact quote, surrounding context, the tools that fit its intent, and what is already attached to that passage — and `resolve_request` clears one entry at a time with a one-line summary, or marks it `skipped` with a reason. The panel counts down as the agent works, and resolved entries stay listed with what the agent said it did.

Queue state deliberately sits outside the research document: marking a new passage never bumps the graph revision an agent is holding as its `baseRevision`, and it never lands on the research undo stack. Requests are dropped when the anchor they point at is removed or undone away.

## WebMCP tools

- `get_pending_requests` — reads the reader's queued requests in order, with anchor, quote, context, and suggested tools.
- `resolve_request` — clears one queued request as done or skipped after the page has actually changed.
- `get_page_context` — reads the article, current selection, anchors, and graph revision.
- `get_current_selection` — reads the durable selection, surrounding text, position, and anchor.
- `get_visible_page_context` — reads the visible article text, active layers, focus, preview, and canvas type.
- `get_canvas_state` — reads visualization state independently from research data, including the live map viewport and the markers currently on screen.
- `get_research_layer` — returns compact nodes and source provenance for one anchor or the whole layer.
- `create_research_nodes` — atomically creates a batch of linked research branches.
- `add_research_source` — attaches an exact source URL and provenance to a node.
- `insert_inline_explanation` — adds an explanation beside the original passage.
- `insert_simplified_layer` — adds reversible plain-language text without replacing the original.
- `add_highlight` — applies a restrained semantic highlight with a reason.
- `add_verification` — adds a cautious source-backed verification state.
- `create_visualization` / `update_visualization` — transforms and automatically opens the right canvas as Research, Diagram, Timeline, Comparison, a sourced Image Board, or a Map.
- `set_map_view` — pans, zooms, or flies the Map canvas to one marker without resending the markers.

The research panel separates the three parts of the work: **Layers** lists every anchor with what has been attached to it, **Queue** holds the requests you have marked but not yet handed off, and **Canvas** holds the Research, Diagram, Timeline, Comparison, Image Board, and Map views. Agent updates open the tab that received them.

## Map canvas

When a passage is about places, the agent can answer with geography instead of prose. `create_visualization` with `type: "map"` opens a real slippy map — OpenStreetMap raster tiles rendered with Leaflet — and each marker carries a label, a note, an optional source link, and the research nodes it came from. Markers are numbered, the legend beside the map lists them in the same order, and selecting either one flies the map there and opens the passage's linked research card.

The map is readable in both directions. `get_canvas_state` and `get_visible_page_context` report the live viewport — center, zoom, bounding box, and which markers are currently on screen — so an agent can tell where the reader is looking before it answers. `set_map_view` moves that viewport without resending marker data.

Coordinates come from the agent. The page never geocodes place names and never reads the reader's device location: markers are rejected unless they carry a real WGS84 latitude and longitude, marker source URLs must be HTTP(S), and a map holds at most 250 markers. Tiles are fetched from `tile.openstreetmap.org` with the required attribution shown on the map; heavier or commercial use should point `TILE_URL` in `src/map-canvas.tsx` at your own tile provider.

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

The end-to-end tests inject a browser-side WebMCP host, execute the actual registered tools, and verify inline explanation, simplification, highlight, sourced verification, visualization, visible branch creation, grouped Undo/Redo, persistence after reload, and browser console health. The map tests stub the tile server, then check marker rendering, the reported viewport, agent-driven focus, reader-driven zoom, and marker removal with Undo.

The queue test marks three passages with three different intents, checks that nothing reaches the clipboard, then reads the queue through `get_pending_requests`, applies each entry, clears it with `resolve_request` (including one skip), and verifies the counts, the resolved history, and persistence across a reload.

The import tests verify URL safety checks, readable-content extraction, imported article persistence, and WebMCP context for the imported source.

## Browser support

The visual workspace works in any current desktop browser. Agent tool discovery requires a WebMCP-capable browser such as ChatGPT's in-app browser or a compatible Chrome build with WebMCP enabled.

## License

[MIT](./LICENSE)
