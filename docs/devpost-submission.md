# Devpost submission draft — The WebMCP Challenge

Working copy for the submission form. Fill the two placeholders (live URL, video URL) before submitting.

## Submission checklist

- [ ] **Live URL**, reachable in ChatGPT’s in-app browser or Chrome with WebMCP enabled
- [ ] **Text description** — the sections below
- [ ] **Demo video** — public YouTube, under 3 minutes, with audio
- [ ] **Public repo** — https://github.com/umahoppe/webmcp_research_tree, MIT licensed, README with setup instructions
- [ ] README live-demo and video links filled in

---

## Inspiration / the problem

Understanding a hard page currently means leaving it. You copy a quote into a chat window, read the answer somewhere else, and come back to a page that has not changed and a place you have lost. The chat knows about your page; your page knows nothing about the chat. Because every question costs a context switch, most questions never get asked at all.

## What it does

Living Page is an agent-native reading surface. The reader marks passages while reading — *explain this*, *simplify this*, *visualize this*, *research this*, *verify this*, or anything typed freely — and the marks wait on the page as a queue. Nothing is copied to a clipboard and nothing is sent. When the reader is done, one sentence in their agent chat — **“Process my marks.”** — hands the whole session over.

A WebMCP agent then reads the queue through tools the page registers and answers *into the page*: an inline explanation beside the sentence that provoked it, a plain-language layer that never replaces the original, a semantic highlight with a stated reason, a source-backed verification, sourced research branches, a strip of pictures, a map of the places involved, or an interactive widget it wrote itself for the reader to operate. Every result is anchored to its passage, attributed, inspectable, and undoable in one step.

Any public article can be imported by URL — PDFs too — and in-article links can be followed, each destination re-imported through the same safety checks, with the full research state of each page restored on Back and Forward.

## Why this fits WebMCP

WebMCP lets a page hand an agent real tools, so the agent no longer has to *describe* a change — it can *make* one. That changes what an answer can be. Living Page treats the agent’s output as interface rather than prose, and it treats the page as the place collaboration happens rather than a source the chat quotes.

The page registers 19 tools on `document.modelContext`: seven read tools that tell an agent what the reader queued, what the article actually says block by block, what is on screen, and where the reader is looking inside a canvas; and twelve write tools that anchor passages, attach layers and sourced research, drive a map, run a sandboxed widget, and close out queue entries.

Five decisions carry the weight:

1. **The queue is the collaboration primitive.** A mark is not a message. `get_pending_requests` hands over a batch of intents, each with the exact quote and surrounding context it is about, so one sentence of chat covers a whole reading session and the round trip stops being per-question.
2. **Anchoring is the reader’s act, with a narrow exception.** A whole-article question has no passage to attach to, so an agent may derive anchors — but `anchor_passage` requires the `requestId` of a still-pending request, supplies words rather than positions, is located in the article by the page itself, and is refused outright if the quote does not exist. An invented quote cannot become an anchor, and one request yields at most ten.
3. **An explicit handshake.** `resolve_request` is how the agent says a change actually landed, as done or as skipped with a reason. Waiting badges clear as work completes; resolved entries stay listed with what the agent said it did. A skip is visible as a skip rather than as silence.
4. **Revision-guarded, reversible writes.** Batch creation takes a `baseRevision` and rejects a stale one. Every agent operation is a single Undo step, and removing an anchor cascades through its layers, cards, and sources. Read tools carry `readOnlyHint` and `untrustedContentHint`.
5. **The agent writes interface.** `create_visualization` with `type: "interactive"` runs an agent-authored document in a frame with `allow-scripts` only — opaque origin, no access to the host page’s DOM, storage, or cookies, and `default-src 'none'` inside, so no network at all. It talks back through exactly two calls, and the reader’s position inside the widget comes back to the agent through `get_canvas_state`, so the next answer can start from the slider they actually moved.

## What it means for the reader

The answer arrives where the question was asked, so nobody loses their place. Marking is cheap, so the questions that used to go unasked get asked. Because a mark waits instead of sending, reading is uninterrupted — the agent works once, on everything. And because each result is anchored, attributed, and reversible, an agent’s contribution stays legible as a contribution rather than becoming an unattributable rewrite of what you were reading.

## Collaboration possibilities

The page keeps a durable, addressable model of a person’s attention — which passages they marked, what they wanted from each, what has already been attached. That is a substrate that outlasts one chat: an agent can pick up a reading session hours later, a second agent can read what the first one attached before adding anything, and the same anchors that carry today’s explanation can carry tomorrow’s verification. The pattern generalizes past articles to any document surface where a person’s attention is worth capturing before the agent acts — contracts, papers, specs, dashboards.

## How we built it

React 19, TypeScript, and Vite on the client; a Cloudflare Worker for `/api/import`, using Mozilla Readability and linkedom for HTML and unpdf for PDFs; Leaflet with OpenStreetMap tiles for the map canvas. State is local, persisted, and fully undoable.

Verification is real rather than mocked: 44 unit tests and 18 Playwright end-to-end tests that inject a browser-side WebMCP host and **execute the actual registered tools** — driving anchoring, every layer type, map viewport control, a sandboxed widget the test then operates as a reader, grouped Undo/Redo, and persistence across reload. The refusals are tested too: an invented quote, an unprompted anchor, an external script inside a widget, pictures pushed onto the canvas, private-network and oversized imports, a scanned PDF with no text layer.

## Challenges

Deciding what an agent may *not* do turned out to be the design work. Letting an agent anchor freely makes hallucinated quotes indistinguishable from the reader’s own attention, so anchoring became quote-located, request-scoped, capped, and labelled. Letting an agent write UI is powerful and is also arbitrary code next to the reader’s article, so the widget frame was given an opaque origin and no network at all, and the two calls it may make back are the entire API.

## What’s next

Multi-page research that carries anchors across the browsing session; shared reading, where one person’s marks and an agent’s answers are legible to another reader; and export of an annotated reading as a sourced document.

---

## Demo video outline (under 3 minutes)

| Time | Beat |
| --- | --- |
| 0:00–0:20 | The problem, on screen: copy a quote into a chat, answer appears somewhere else, you have lost your place. |
| 0:20–0:50 | Read the article. Mark three passages with three different intents — Explain, Verify, Visualize. Point out that nothing was sent and no clipboard was involved; the marks wait as badges on their own passages. |
| 0:50–1:05 | Say the one sentence to the agent: “Process my marks.” |
| 1:05–1:50 | The page changes: inline explanation beside the sentence, sourced verification, research branches, and the widget on the canvas. Operate the widget. |
| 1:50–2:15 | Ask a whole-article question — explain a term — and show the agent anchoring every place it matters, labelled *Agent anchored*. |
| 2:15–2:40 | Show the guarantees: attribution, sources, one Undo restoring a whole agent operation. |
| 2:40–3:00 | Import a real public URL, follow an in-article link, and close on the pitch: the answer arrives where the question was asked. |
