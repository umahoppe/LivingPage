# Living Page · Research Garden

**The web page adapts to how you want to understand it.**

Living Page is an agent-native layer for understanding the web. A person selects something in the article and an agent turns its answer into interface: an inline explanation, a simplified layer, a semantic highlight, a sourced verification, a research branch, or a visualization. Research Garden remains the deep-research mode inside that experience.

Public articles can be imported by URL. The Sites Worker produces two synchronized forms from the same Readability DOM: structured blocks for research and a safe static snapshot that retains the article's classes, images, inline styles, and a bounded set of HTTPS stylesheets. Scripts, forms, embeds, local-network targets, unsupported content types, and oversized responses are rejected.

Imported articles form a small research browser. Every `<a href>` is resolved against the article's own URL, and a click imports the destination through the same safety checks instead of letting untrusted content navigate the frame. Back and Forward restore the complete per-page research document — anchors, marks, inline layers, sources, canvas, and Undo history — for up to six recent pages. The toolbar also finds text immediately inside the current snapshot. Text entered in its address field instead of a URL becomes a document-scoped web-search mark for the WebMCP agent; this is deliberately queued rather than pretending that page-side tool registration can launch an agent by itself.

## Golden path

1. Import a public article URL, or use the built-in demo article.
2. Select a sentence and choose Explain, Simplify, Visualize, Research, or Verify. Follow any in-article link in the side reader when the source itself answers the question.
3. The selection becomes a durable text anchor and the choice waits on that passage in the **Layers** tab — nothing is copied to the clipboard, and nothing is sent yet. Keep reading and mark as many passages as you like; the ask bar adds free-text requests for anything the five presets do not cover, and with nothing selected it asks about the article as a whole.
4. Say one sentence in your agent chat — *Process my marks.* A WebMCP-capable agent reads the whole queue, works through it in the order you marked it, and updates the article or Visual Thinking Canvas.
5. The Canvas holds whatever the agent last sent: a Map of the places involved, or an interactive widget it wrote — a diagram, a chronology, a comparison you can re-sort, a model you can operate. There is no view to pick; the agent decides the shape and the underlying sources never change.
6. Track every anchored passage in the Layers tab — inline explanations, simplifications, highlights, verifications, and research cards all stay listed with the passage they belong to, and selecting one scrolls the article back to it.
7. Pictures arrive beside the text rather than on the canvas, as an image layer on the passage they belong to. Review provenance in place, open image previews, remove mistaken anchors or cards, or undo the complete operation.

## PDF import

A PDF URL imports and works, but the import dialog does not offer it. Extraction quality is uneven in ways the reader cannot predict from the URL alone — see the layout caveats below — so the page makes no promise it cannot keep for an arbitrary file. Paste one and it is read; the refusals below explain themselves when it cannot be.

A PDF reaches the page as the same `ArticleDocument` an HTML import produces, so anchoring, queued marks, inline layers, research cards, and the canvas work on it unchanged. What differs is what a PDF can carry.

A PDF has no paragraphs — it has lines placed on a page — so the worker rebuilds them. Lines are joined into paragraphs, a word broken across a line break loses its hyphen, and a line that stops short of the column width ends its paragraph. Lines that repeat identically across pages are running heads or footers and are dropped, as are bare folios. A short unpunctuated line standing alone becomes a heading, which is what lets a section title survive the length floor that body text has to clear.

These are heuristics about typography, and the markup of an HTML article states outright what they have to guess. A two-column layout or a heavily tabular report will read out of order, because column geometry is the only thing the file records about reading order. There are no in-text links to follow in a side reader and no hero image, since neither exists to extract.

A scanned PDF parses perfectly and yields nothing. Rather than importing a blank article, the worker says the file has no text layer; there is no text recognition here. Encrypted or damaged files are refused the same way, PDFs are capped at 10 MB and 60 pages, and every URL goes through the same redirect, port, and private-network checks an HTML import does.

## Request queue

The selection menu does not produce a message for you to carry. Every pick appends a request to a queue that lives on the page: intent, the anchored quote and its surrounding context, and the prompt. You read at your own pace, marking Explain here and Verify there, and the chat round trip collapses into a single sentence at the end.

The queue has no tab of its own, because a pending request is a state a passage is in rather than a separate list. Each mark shows as a **waiting** badge on the anchor it was made on in Layers, and opening that row shows the prompt with its own remove button; a question about the whole article sits in one pinned row at the top. The count in the ask bar copies the full handoff text for your agent.

The agent then drives the whole batch itself. `get_pending_requests` returns the queue in order — each entry with its `requestId`, `anchorId`, exact quote, surrounding context, the tools that fit its intent, and what is already attached to that passage — and `resolve_request` clears one entry at a time with a one-line summary, or marks it `skipped` with a reason. The badges clear as the agent works, and resolved entries stay listed at the bottom of Layers with what the agent said it did.

## Who may anchor

Anchoring is the reader's act: selecting a passage is how attention enters the page, and every anchor made that way is recorded as theirs. But a reader can only mark what they already noticed, and a question about the whole article — *verify the strongest statistic here* — has no passage to attach to. So the queue takes document-scoped requests too, and an agent may derive the anchors such a request needs.

That permission is deliberately narrow. `anchor_passage` requires the `requestId` of a request still pending, so the agent anchors only inside work the reader asked for and never on its own initiative. It supplies the words, not the position: the page locates the quote in the article itself and refuses one it cannot find, so an invented quote cannot become an anchor. One request yields at most ten anchors. Anchors made this way are marked **Agent anchored** in the Layers tab, carry the request they came from, and are removed, cascaded, and undone exactly like the reader's own.

Queue state deliberately sits outside the research document: marking a new passage never bumps the graph revision an agent is holding as its `baseRevision`, and it never lands on the research undo stack. Requests are dropped when the anchor they point at is removed or undone away.

## WebMCP tools

- `get_pending_requests` — reads the reader's queued requests in order, with scope, anchor, quote, context, and suggested tools.
- `get_article_blocks` — reads the article as addressable blocks with their exact text, for quoting it verbatim.
- `anchor_passage` — anchors an exact quote on the reader's behalf, only for a request they queued.
- `resolve_request` — clears one queued request as done or skipped after the page has actually changed.
- `get_page_context` — reads the article, current selection, anchors, and graph revision.
- `get_current_selection` — reads the durable selection, surrounding text, position, and anchor.
- `get_visible_page_context` — reads the visible article text, active layers, focus, preview, canvas type, and the canvas card the reader last opened.
- `get_canvas_state` — reads visualization state independently from research data, including the card the reader is looking at and, on a Map, the live viewport and the markers currently on screen.
- `get_research_layer` — returns compact nodes and source provenance for one anchor or the whole layer.
- `create_research_nodes` — atomically creates a batch of linked research branches.
- `add_research_source` — attaches an exact source URL and provenance to a node.
- `insert_inline_explanation` — adds an explanation beside the original passage.
- `insert_simplified_layer` — adds reversible plain-language text without replacing the original.
- `add_highlight` — applies a restrained semantic highlight with a reason.
- `add_verification` — adds a cautious source-backed verification state.
- `insert_image_layer` — puts a strip of sourced pictures beside the passage, where the sandbox cannot reach.
- `create_visualization` / `update_visualization` — fills the one canvas with a Map or a sandboxed Interactive widget, and opens it.
- `set_map_view` — pans, zooms, or flies the Map canvas to one marker without resending the markers.

The research panel has two tabs. **Layers** is the source of truth: every anchor with its inline explanations, image strips, research cards, and the marks still waiting on it. **Canvas** holds the one visual surface. Agent updates open the tab that received them.

## One canvas

The canvas used to be six views behind a switcher, with only one of them alive at a time — the reader picked a tab and the previous view was gone. It is now one surface, and what the agent last sent is what shows.

That leaves two kinds of thing. An **Interactive** widget is html the agent writes, and it is how a diagram, a chronology, or a comparison gets drawn now: those were only ever text and shapes, and an agent that writes them itself can make them do things a fixed renderer could not — re-sortable columns, differences highlighted, an axis the reader switches. A **Map** stays host-drawn, because the sandbox has no network and map tiles come over one.

Pictures are neither, for the same reason: the sandbox cannot load an external image. They go beside the passage as an image layer, which is also where the reader wants them — next to the sentence, not on a surface they have to switch to.

Research nodes never fill the canvas on their own. It stays empty until an agent explicitly builds something.

## Where the reader is looking

Every canvas reports the card the reader last opened. `get_canvas_state` and `get_visible_page_context` return `readerFocus` — the canvas type, the card's id and label, and the research nodes behind it — so "dig into this one" resolves without the reader naming anything. Focus recorded on a canvas the reader has since left, or on a card that has since been removed, is reported as none rather than as a stale answer. The Map canvas adds its own live viewport on top of this.

## Map canvas

When a passage is about places, the agent can answer with geography instead of prose. `create_visualization` with `type: "map"` opens a real slippy map — OpenStreetMap raster tiles rendered with Leaflet — and each marker carries a label, a note, an optional source link, and the research nodes it came from. Markers are numbered, the legend beside the map lists them in the same order, and selecting either one flies the map there and opens the passage's linked research card.

The map is readable in both directions. `get_canvas_state` and `get_visible_page_context` report the live viewport — center, zoom, bounding box, and which markers are currently on screen — so an agent can tell where the reader is looking before it answers. `set_map_view` moves that viewport without resending marker data.

Coordinates come from the agent. The page never geocodes place names and never reads the reader's device location: markers are rejected unless they carry a real WGS84 latitude and longitude, marker source URLs must be HTTP(S), and a map holds at most 250 markers. Tiles are fetched from `tile.openstreetmap.org` with the required attribution shown on the map; heavier or commercial use should point `TILE_URL` in `src/map-canvas.tsx` at your own tile provider.

## Interactive canvas

Some answers are not a picture but a thing to operate: a break-even model, a rate you can vary, a small simulation of the mechanism the paragraph describes. `create_visualization` with `type: "interactive"` takes one self-contained document — markup, inline `<style>`, inline `<script>` — and runs it as a widget beside the article, the same approach as Claude's Artifacts or ChatGPT's Canvas.

It runs in an isolated frame. The sandbox is `allow-scripts` and nothing else: without `allow-same-origin` the widget lives on an opaque origin, so it cannot read this page's DOM, its `localStorage`, or its cookies. A CSP meta tag inside the frame sets `default-src 'none'`, which leaves it no network at all — no fetch, no external script or stylesheet, no image or font from another host, no form submission. Because those resources would be dead on arrival, the page rejects widget HTML that references them rather than rendering something that silently fails, and a widget is capped at 60,000 characters.

The widget talks back through two calls, and nothing else. `livingPage.setState(value)` posts a small plain-data value to the page, which stores it as the reader's live position — at most 4,000 characters of JSON, no more durable than a scroll offset. `get_canvas_state` returns it as `interactiveState`, so the agent can read the slider the reader actually moved and answer from there, and the widget's frame is also what `readerFocus` reports. `livingPage.openCard(nodeId)` opens one sourced research card, which is what a widget-drawn diagram or comparison uses in place of the card click a host-drawn canvas used to give; the frame is untrusted, so a card the page does not hold opens nothing and says so. Reset throws the frame away and builds it again from the same source; Remove deletes the widget whole, and Undo restores it.

This does not make the article executable. Imported article text is never run as code — it is extracted as structured text, and scripts, forms, and embeds are dropped at import. The only code that runs is code an agent wrote in response to the reader's own request, and it runs walled off from the page it sits beside.

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

The end-to-end tests inject a browser-side WebMCP host, execute the actual registered tools, and verify inline explanation, simplification, highlight, sourced verification, visualization, visible branch creation, grouped Undo/Redo, persistence after reload, and browser console health. The map tests stub the tile server, then check marker rendering, the reported viewport, agent-driven focus, reader-driven zoom, and marker removal with Undo. The canvas tests check that there is no view switcher, that the canvas stays empty until an agent builds something, and that a widget-drawn chronology can open a sourced research card through `livingPage.openCard` while a card the page does not hold opens nothing.

The anchoring test asks a whole-article question with nothing selected, then has the agent read the blocks, anchor the exact claim, verify it, and clear the request — checking that the derived anchor lands on the right offsets and is attributed to the agent, that an invented quote and an unprompted anchor are both refused, and that the result survives a reload and undoes like any other anchor.

The queue test marks three passages with three different intents, checks that nothing reaches the clipboard until the ask-bar count is clicked, then reads the queue through `get_pending_requests`, applies each entry, clears it with `resolve_request` (including one skip), and verifies the waiting badges, the resolved history, and persistence across a reload. The image test has an agent attach a picture strip beside a passage, opens the preview, and checks that the same pictures are refused on the canvas.

The interactive test has an agent send a slider widget, drives the slider as a reader, and reads the reported value back through `get_canvas_state` — including the widget's own probe showing that the parent document and `localStorage` are both out of reach — then checks that an external script is refused, that Reset clears the reported state, and that Remove and Undo behave like any other canvas change.

The import tests verify URL safety checks, readable-content extraction, imported article persistence, and WebMCP context for the imported source. The PDF tests build real PDFs and run them through the parser: paragraph reconstruction from wrapped lines, hyphen repair, running heads and folios dropped, headings kept, metadata and dates read, and refusals for a scan with no text layer, a file too thin to read, an unreadable file, and one past the size budget. An end-to-end test imports a PDF-shaped article and anchors and verifies a passage in it, checking that a document with no links and no hero image still supports the full layer stack.

## Browser support

The visual workspace works in any current desktop browser. Agent tool discovery requires a WebMCP-capable browser such as ChatGPT's in-app browser or a compatible Chrome build with WebMCP enabled.

## License

[MIT](./LICENSE)
