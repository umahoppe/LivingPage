# Architecture and design notes

Reference detail behind [the README](../README.md). Everything here is implemented and covered by tests.

- [Request queue](#request-queue)
- [Who may anchor](#who-may-anchor)
- [One canvas](#one-canvas)
- [Where the reader is looking](#where-the-reader-is-looking)
- [Map canvas](#map-canvas)
- [Interactive canvas](#interactive-canvas)
- [HTML import and the research browser](#html-import-and-the-research-browser)
- [PDF import](#pdf-import)
- [Verification](#verification)

## Request queue

The selection menu does not produce a message for you to carry. Every pick appends a request to a queue that lives on the page: intent, the anchored quote and its surrounding context, and the prompt. You read at your own pace, marking Explain here and Verify there, and the chat round trip collapses into a single sentence at the end.

The queue has no tab of its own, because a pending request is a state a passage is in rather than a separate list. Each mark shows as a **waiting** badge on the anchor it was made on in Layers, and opening that row shows the prompt with its own remove button; a question about the whole article sits in one pinned row at the top. The count in the ask bar copies the full handoff text for your agent.

Marking a passage does not move the panel. The request lands in the queue and the reader stays where they were reading; the panel opens on its own only when an agent’s work actually arrives.

The agent then drives the whole batch itself. `get_pending_requests` returns the queue in order — each entry with its `requestId`, `anchorId`, exact quote, surrounding context, the tools that fit its intent, and what is already attached to that passage — and `resolve_request` clears one entry at a time with a one-line summary, or marks it `skipped` with a reason. The badges clear as the agent works, and resolved entries stay listed at the bottom of Layers with what the agent said it did.

Queue state deliberately sits outside the research document: marking a new passage never bumps the graph revision an agent is holding as its `baseRevision`, and it never lands on the research undo stack. Requests are dropped when the anchor they point at is removed or undone away.

## Who may anchor

Anchoring is the reader’s act: selecting a passage is how attention enters the page, and every anchor made that way is recorded as theirs. But a reader can only mark what they already noticed, and a question about the whole article — *verify the strongest statistic here* — has no passage to attach to. So the queue takes document-scoped requests too, and an agent may derive the anchors such a request needs.

A term question is the clearest case. **Explain a term** in the ask bar turns *quantitative easing* into a whole-article Explain: the agent reads `get_article_blocks`, anchors the places the term actually carries that meaning — `occurrence` separates repeats of the same words — explains it once beside the first of them, and marks the rest with `add_highlight` rather than stacking the same card on ten passages. The reader named a word, not a position, and the passages still come back to them as anchors they can open, remove, or undo.

That permission is deliberately narrow. `anchor_passage` requires the `requestId` of a request still pending, so the agent anchors only inside work the reader asked for and never on its own initiative. It supplies the words, not the position: the page locates the quote in the article itself and refuses one it cannot find, so an invented quote cannot become an anchor. One request yields at most ten anchors. Anchors made this way are marked **Agent anchored** in the Layers tab, carry the request they came from, and are removed, cascaded, and undone exactly like the reader’s own.

## One canvas

The canvas used to be six views behind a switcher, with only one of them alive at a time — the reader picked a tab and the previous view was gone. It is now one surface, and what the agent last sent is what shows.

That leaves two kinds of thing. An **Interactive** widget is HTML the agent writes, and it is how a diagram, a chronology, or a comparison gets drawn now: those were only ever text and shapes, and an agent that writes them itself can make them do things a fixed renderer could not — re-sortable columns, differences highlighted, an axis the reader switches. A **Map** stays host-drawn, because the sandbox has no network and map tiles come over one.

Pictures are neither, for the same reason: the sandbox cannot load an external image. They go beside the passage as an image layer, which is also where the reader wants them — next to the sentence, not on a surface they have to switch to.

Research nodes never fill the canvas on their own. It stays empty until an agent explicitly builds something.

## Where the reader is looking

Every canvas reports the card the reader last opened. `get_canvas_state` and `get_visible_page_context` return `readerFocus` — the canvas type, the card’s id and label, and the research nodes behind it — so “dig into this one” resolves without the reader naming anything. Focus recorded on a canvas the reader has since left, or on a card that has since been removed, is reported as none rather than as a stale answer. The Map canvas adds its own live viewport on top of this.

## Map canvas

When a passage is about places, the agent can answer with geography instead of prose. `create_visualization` with `type: "map"` opens a real slippy map — OpenStreetMap raster tiles rendered with Leaflet — and each marker carries a label, a note, an optional source link, and the research nodes it came from. Markers are numbered, the legend beside the map lists them in the same order, and selecting either one flies the map there and opens the passage’s linked research card.

The map is readable in both directions. `get_canvas_state` and `get_visible_page_context` report the live viewport — center, zoom, bounding box, and which markers are currently on screen — so an agent can tell where the reader is looking before it answers. `set_map_view` moves that viewport without resending marker data.

Coordinates come from the agent. The page never geocodes place names and never reads the reader’s device location: markers are rejected unless they carry a real WGS84 latitude and longitude, marker source URLs must be HTTP(S), and a map holds at most 250 markers. Tiles are fetched from `tile.openstreetmap.org` with the required attribution shown on the map; heavier or commercial use should point `TILE_URL` in `src/map-canvas.tsx` at your own tile provider.

## Interactive canvas

Some answers are not a picture but a thing to operate: a break-even model, a rate you can vary, a small simulation of the mechanism the paragraph describes. `create_visualization` with `type: "interactive"` takes one self-contained document — markup, inline `<style>`, inline `<script>` — and runs it as a widget beside the article, the same approach as Claude’s Artifacts or ChatGPT’s Canvas.

It runs in an isolated frame. The sandbox is `allow-scripts` and nothing else: without `allow-same-origin` the widget lives on an opaque origin, so it cannot read this page’s DOM, its `localStorage`, or its cookies. A CSP meta tag inside the frame sets `default-src 'none'`, which leaves it no network at all — no fetch, no external script or stylesheet, no image or font from another host, no form submission. Because those resources would be dead on arrival, the page rejects widget HTML that references them rather than rendering something that silently fails, and a widget is capped at 60,000 characters.

The widget talks back through two calls, and nothing else. `livingPage.setState(value)` posts a small plain-data value to the page, which stores it as the reader’s live position — at most 4,000 characters of JSON, no more durable than a scroll offset. `get_canvas_state` returns it as `interactiveState`, so the agent can read the slider the reader actually moved and answer from there, and the widget’s frame is also what `readerFocus` reports. `livingPage.openCard(nodeId)` opens one sourced research card, which is what a widget-drawn diagram or comparison uses in place of the card click a host-drawn canvas used to give; the frame is untrusted, so a card the page does not hold opens nothing and says so. Reset throws the frame away and builds it again from the same source; Remove deletes the widget whole, and Undo restores it.

This does not make the article executable. Imported article text is never run as code — it is extracted as structured text, and scripts, forms, and embeds are dropped at import. The only code that runs is code an agent wrote in response to the reader’s own request, and it runs walled off from the page it sits beside.

## HTML import and the research browser

Public articles are imported by URL. The Worker produces two synchronized forms from the same Readability DOM: structured blocks for research and a safe static snapshot that retains the article’s classes, images, inline styles, and a bounded set of HTTPS stylesheets. Scripts, forms, embeds, local-network targets, unsupported content types, and oversized responses are rejected.

Imported articles form a small research browser. Every `<a href>` is resolved against the article’s own URL, and a click imports the destination through the same safety checks instead of letting untrusted content navigate the frame. Back and Forward restore the complete per-page research document — anchors, marks, inline layers, sources, canvas, and Undo history — for up to six recent pages. The toolbar also finds text immediately inside the current snapshot. Text entered in its address field instead of a URL becomes a document-scoped web-search mark for the WebMCP agent; this is deliberately queued rather than pretending that page-side tool registration can launch an agent by itself.

Read tools use `readOnlyHint` and `untrustedContentHint`. Research data, inline layers, and canvas state are stored separately but share the same reversible history and local persistence. Removing an anchor cascades through its inline layers, research cards, and sources; Undo restores the whole operation.

## PDF import

A PDF URL imports and works, but the import dialog does not offer it. Extraction quality is uneven in ways the reader cannot predict from the URL alone — see the layout caveats below — so the page makes no promise it cannot keep for an arbitrary file. Paste one and it is read; the refusals below explain themselves when it cannot be.

A PDF reaches the page as the same `ArticleDocument` an HTML import produces, so anchoring, queued marks, inline layers, research cards, and the canvas work on it unchanged. What differs is what a PDF can carry.

A PDF has no paragraphs — it has lines placed on a page — so the worker rebuilds them. Lines are joined into paragraphs, a word broken across a line break loses its hyphen, and a line that stops short of the column width ends its paragraph. Lines that repeat identically across pages are running heads or footers and are dropped, as are bare folios. A short unpunctuated line standing alone becomes a heading, which is what lets a section title survive the length floor that body text has to clear.

These are heuristics about typography, and the markup of an HTML article states outright what they have to guess. A two-column layout or a heavily tabular report will read out of order, because column geometry is the only thing the file records about reading order. There are no in-text links to follow in a side reader and no hero image, since neither exists to extract.

A scanned PDF parses perfectly and yields nothing. Rather than importing a blank article, the worker says the file has no text layer; there is no text recognition here. Encrypted or damaged files are refused the same way, PDFs are capped at 10 MB and 60 pages, and every URL goes through the same redirect, port, and private-network checks an HTML import does.

## Verification

```bash
npm test          # 44 unit tests
npm run test:e2e  # 18 end-to-end tests
npm run lint
npm run build
```

The end-to-end tests inject a browser-side WebMCP host, execute the actual registered tools, and verify inline explanation, simplification, highlight, sourced verification, visualization, visible branch creation, grouped Undo/Redo, persistence after reload, and browser console health. The map tests stub the tile server, then check marker rendering, the reported viewport, agent-driven focus, reader-driven zoom, and marker removal with Undo. The canvas tests check that there is no view switcher, that the canvas stays empty until an agent builds something, and that a widget-drawn chronology can open a sourced research card through `livingPage.openCard` while a card the page does not hold opens nothing.

The anchoring test asks a whole-article question with nothing selected, then has the agent read the blocks, anchor the exact claim, verify it, and clear the request — checking that the derived anchor lands on the right offsets and is attributed to the agent, that an invented quote and an unprompted anchor are both refused, and that the result survives a reload and undoes like any other anchor.

The queue test marks three passages with three different intents, checks that nothing reaches the clipboard until the ask-bar count is clicked, then reads the queue through `get_pending_requests`, applies each entry, clears it with `resolve_request` (including one skip), and verifies the waiting badges, the resolved history, and persistence across a reload. The image test has an agent attach a picture strip beside a passage, opens the preview, and checks that the same pictures are refused on the canvas.

The interactive test has an agent send a slider widget, drives the slider as a reader, and reads the reported value back through `get_canvas_state` — including the widget’s own probe showing that the parent document and `localStorage` are both out of reach — then checks that an external script is refused, that Reset clears the reported state, and that Remove and Undo behave like any other canvas change.

The import tests verify URL safety checks, readable-content extraction, imported article persistence, and WebMCP context for the imported source. The PDF tests build real PDFs and run them through the parser: paragraph reconstruction from wrapped lines, hyphen repair, running heads and folios dropped, headings kept, metadata and dates read, and refusals for a scan with no text layer, a file too thin to read, an unreadable file, and one past the size budget. An end-to-end test imports a PDF-shaped article and anchors and verifies a passage in it, checking that a document with no links and no hero image still supports the full layer stack.
