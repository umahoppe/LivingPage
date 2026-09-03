import { useCallback, useEffect, useRef, useState } from "react";
import { setArticleSurface, type ArticleSurfaceAdapter } from "./article-surface";
import type { ArticleDocument, LivingAnnotation, ResearchAnchor } from "./types";

export interface SurfaceSelection {
  blockId: string;
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  x: number;
  y: number;
}

export interface SurfaceAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ImportedPageFrameProps {
  article: ArticleDocument;
  anchors: ResearchAnchor[];
  annotations: LivingAnnotation[];
  searchQuery: string;
  revealedAnchorId?: string;
  onAnchorHoverStart: (anchorId: string, rect: SurfaceAnchorRect) => void;
  onAnchorHoverEnd: () => void;
  onAnchorPress: (anchorId: string, rect: SurfaceAnchorRect) => void;
  onLinkOpen: (url: string) => void;
  onSelectionChange: (selection?: SurfaceSelection) => void;
  onSearchCount: (count: number) => void;
}

interface HighlightRegistryLike {
  clear(): void;
  delete(name: string): void;
  set(name: string, value: unknown): void;
}

function textNodes(root: Node) {
  const document = root.ownerDocument!;
  const walker = document.createTreeWalker(root, document.defaultView!.NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest(".rg-injected")
      ? document.defaultView!.NodeFilter.FILTER_REJECT
      : document.defaultView!.NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/**
 * Readability stores a canonical block string with whitespace runs collapsed. The snapshot keeps
 * the publisher's original text nodes, so raw DOM offsets cannot be used as canonical offsets.
 * This index mirrors collectTextWithLinks in the importer and maps both directions.
 */
function canonicalTextIndex(root: Element) {
  const nodes = textNodes(root);
  const raw = nodes.map((node) => node.data).join("");
  const canonicalAtRawBoundary = new Array<number>(raw.length + 1).fill(0);
  let canonical = "";
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (/\s/.test(character)) {
      if (canonical && !canonical.endsWith(" ")) canonical += " ";
    } else {
      canonical += character;
    }
    canonicalAtRawBoundary[index + 1] = canonical.length;
  }
  canonical = canonical.trimEnd();
  for (let index = 0; index < canonicalAtRawBoundary.length; index += 1) {
    canonicalAtRawBoundary[index] = Math.min(canonicalAtRawBoundary[index], canonical.length);
  }

  const rawOffset = (target: Node, offset: number) => {
    let total = 0;
    for (const node of nodes) {
      if (node === target) return total + Math.max(0, Math.min(node.data.length, offset));
      total += node.data.length;
    }
    return total;
  };
  const positionAtRaw = (rawBoundary: number) => {
    let cursor = 0;
    for (const node of nodes) {
      const next = cursor + node.data.length;
      if (rawBoundary <= next) return { node, offset: Math.max(0, rawBoundary - cursor) };
      cursor = next;
    }
    const node = nodes.at(-1);
    return node ? { node, offset: node.data.length } : undefined;
  };
  const rawForCanonical = (offset: number, edge: "start" | "end") => {
    const bounded = Math.max(0, Math.min(canonical.length, offset));
    if (edge === "start") {
      for (let index = 0; index < raw.length; index += 1) {
        if (canonicalAtRawBoundary[index] === bounded && canonicalAtRawBoundary[index + 1] > bounded) return index;
      }
    }
    const found = canonicalAtRawBoundary.findIndex((value) => value >= bounded);
    return found < 0 ? raw.length : found;
  };
  return {
    canonical,
    canonicalOffset: (target: Node, offset: number) => canonicalAtRawBoundary[rawOffset(target, offset)] ?? canonical.length,
    positionAtCanonical: (offset: number, edge: "start" | "end") => positionAtRaw(rawForCanonical(offset, edge)),
  };
}

function rangeForOffsets(root: Element, start: number, end: number) {
  const document = root.ownerDocument!;
  const range = document.createRange();
  const index = canonicalTextIndex(root);
  const startPosition = index.positionAtCanonical(start, "start");
  const endPosition = index.positionAtCanonical(end, "end");
  if (!startPosition || !endPosition) return undefined;
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  return range;
}

function highlightConstructor(document: Document) {
  return (document.defaultView as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
}

function registry(document: Document) {
  return (document.defaultView?.CSS as unknown as { highlights?: HighlightRegistryLike })?.highlights;
}

function searchableRanges(document: Document, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const ranges: Range[] = [];
  for (const block of document.querySelectorAll<HTMLElement>("[data-rg-block-id]")) {
    const text = canonicalTextIndex(block).canonical;
    const lower = text.toLocaleLowerCase();
    let from = 0;
    while (ranges.length < 200) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      const range = rangeForOffsets(block, index, index + query.trim().length);
      if (range) ranges.push(range);
      from = index + Math.max(1, needle.length);
    }
  }
  return ranges;
}

export function ImportedPageFrame({
  article,
  anchors,
  annotations,
  searchQuery,
  revealedAnchorId,
  onAnchorHoverStart,
  onAnchorHoverEnd,
  onAnchorPress,
  onLinkOpen,
  onSelectionChange,
  onSearchCount,
}: ImportedPageFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<() => void>(() => undefined);
  const [height, setHeight] = useState(720);
  const [loadedDocument, setLoadedDocument] = useState<Document>();

  const decorate = useCallback((document: Document) => {
    document.querySelectorAll(".rg-injected").forEach((node) => node.remove());
    const Highlight = highlightConstructor(document);
    const highlights = registry(document);
    highlights?.delete("rg-anchors");
    if (Highlight && highlights) {
      const ranges = anchors.flatMap((anchor) => {
        const block = document.querySelector<HTMLElement>(`[data-rg-block-id="${CSS.escape(anchor.blockId)}"]`);
        const range = block ? rangeForOffsets(block, anchor.startOffset, anchor.endOffset) : undefined;
        return range ? [range] : [];
      });
      if (ranges.length) highlights.set("rg-anchors", new Highlight(...ranges));
    }

    for (const block of document.querySelectorAll<HTMLElement>("[data-rg-block-id]")) {
      const blockAnchors = anchors.filter((anchor) => anchor.blockId === block.dataset.rgBlockId);
      if (!blockAnchors.length) continue;
      const rail = document.createElement("span");
      rail.className = "rg-injected rg-anchor-rail";
      rail.setAttribute("aria-label", `${blockAnchors.length} anchored passage${blockAnchors.length === 1 ? "" : "s"}`);
      for (const [index, anchor] of blockAnchors.entries()) {
        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "rg-anchor-count";
        pin.dataset.anchorId = anchor.id;
        pin.textContent = blockAnchors.length === 1 ? "1 layer" : String(index + 1);
        pin.title = `Preview anchor: ${anchor.quote}`;
        rail.appendChild(pin);
      }
      block.prepend(rail);

      for (const anchor of blockAnchors) {
        for (const annotation of annotations.filter((item) => item.anchorId === anchor.id && item.type !== "highlight" && !item.isCollapsed)) {
          const card = document.createElement("aside");
          card.className = "rg-injected rg-inline-layer";
          card.dataset.anchorId = anchor.id;
          const title = document.createElement("strong");
          title.textContent = annotation.title || (annotation.type === "verification" ? "Verification" : annotation.type === "simplification" ? "Simplified" : annotation.type === "images" ? "Images" : "Explanation");
          const copy = document.createElement("p");
          copy.textContent = annotation.content || annotation.reason || "Attached to this passage";
          card.append(title, copy);
          if (annotation.images?.length) {
            const images = document.createElement("div");
            images.className = "rg-inline-images";
            for (const item of annotation.images) {
              const figure = document.createElement("figure");
              const image = document.createElement("img");
              image.src = item.imageUrl;
              image.alt = item.title;
              image.loading = "lazy";
              image.referrerPolicy = "no-referrer";
              const caption = document.createElement("figcaption");
              caption.textContent = item.note ? `${item.title} — ${item.note}` : item.title;
              figure.append(image, caption);
              images.appendChild(figure);
            }
            card.appendChild(images);
          }
          if (annotation.sources?.length) {
            const sources = document.createElement("div");
            sources.className = "rg-inline-sources";
            for (const source of annotation.sources) {
              const link = document.createElement("a");
              link.href = source.url;
              link.textContent = source.title;
              link.rel = "noreferrer nofollow";
              sources.appendChild(link);
            }
            card.appendChild(sources);
          }
          block.insertAdjacentElement("afterend", card);
        }
      }
    }
  }, [anchors, annotations]);

  const updateSearch = useCallback((document: Document) => {
    const highlights = registry(document);
    highlights?.delete("rg-search");
    const ranges = searchableRanges(document, searchQuery);
    const Highlight = highlightConstructor(document);
    if (ranges.length && highlights && Highlight) {
      highlights.set("rg-search", new Highlight(...ranges));
      (ranges[0].startContainer.parentElement ?? ranges[0].commonAncestorContainer.parentElement)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onSearchCount(ranges.length);
    return ranges.length;
  }, [onSearchCount, searchQuery]);

  useEffect(() => {
    if (!loadedDocument) return;
    decorate(loadedDocument);
    updateSearch(loadedDocument);
  }, [decorate, loadedDocument, updateSearch]);

  const handleLoad = useCallback(() => {
    cleanupRef.current();
    const frame = frameRef.current;
    const document = frame?.contentDocument;
    const frameWindow = frame?.contentWindow;
    if (!frame || !document || !frameWindow) return;
    setLoadedDocument(document);

    let resizeFrame: number | undefined;
    const resize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const next = Math.max(420, Math.min(20_000, document.documentElement.scrollHeight));
        setHeight((current) => Math.abs(current - next) > 1 ? next : current);
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.documentElement);
    resize();

    const readSelection = () => {
      const selection = frameWindow.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        onSelectionChange(undefined);
        return;
      }
      const range = selection.getRangeAt(0);
      const start = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer as Element;
      const block = start?.closest<HTMLElement>("[data-rg-block-id]");
      if (!block || !block.contains(range.endContainer)) {
        onSelectionChange(undefined);
        return;
      }
      const canonical = article.blocks.find((candidate) => candidate.id === block.dataset.rgBlockId);
      if (!canonical) return;
      const textIndex = canonicalTextIndex(block);
      let startOffset = textIndex.canonicalOffset(range.startContainer, range.startOffset);
      let endOffset = textIndex.canonicalOffset(range.endContainer, range.endOffset);
      const selected = canonical.text.slice(startOffset, endOffset);
      startOffset += selected.length - selected.trimStart().length;
      endOffset -= selected.length - selected.trimEnd().length;
      const quote = canonical.text.slice(startOffset, endOffset).replace(/\s+/g, " ").trim();
      const rect = range.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      onSelectionChange({
        blockId: canonical.id,
        quote,
        prefix: canonical.text.slice(Math.max(0, startOffset - 48), startOffset),
        suffix: canonical.text.slice(endOffset, endOffset + 48),
        startOffset,
        endOffset,
        x: frameRect.left + rect.left + rect.width / 2,
        y: frameRect.top + rect.bottom,
      });
    };
    const anchorRect = (element: Element): SurfaceAnchorRect => {
      const rect = element.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        left: frameRect.left + rect.left,
        top: frameRect.top + rect.top,
        right: frameRect.left + rect.right,
        bottom: frameRect.top + rect.bottom,
      };
    };
    const click = (event: MouseEvent) => {
      const target = event.target && (event.target as Node).nodeType === Node.ELEMENT_NODE
        ? event.target as Element
        : undefined;
      const anchorBadge = target?.closest<HTMLElement>("[data-anchor-id]");
      if (anchorBadge?.dataset.anchorId) {
        event.preventDefault();
        onAnchorPress(anchorBadge.dataset.anchorId, anchorRect(anchorBadge));
        return;
      }
      const link = target?.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      event.preventDefault();
      if (link.href.startsWith("http://") || link.href.startsWith("https://")) onLinkOpen(link.href);
      else if (link.hash) document.querySelector(link.hash)?.scrollIntoView({ behavior: "smooth" });
    };
    const pointerOver = (event: PointerEvent) => {
      const element = event.target && (event.target as Node).nodeType === Node.ELEMENT_NODE ? event.target as Element : null;
      const target = element?.closest<HTMLElement>("[data-anchor-id]");
      if (target?.dataset.anchorId) onAnchorHoverStart(target.dataset.anchorId, anchorRect(target));
    };
    const pointerOut = (event: PointerEvent) => {
      const element = event.target && (event.target as Node).nodeType === Node.ELEMENT_NODE ? event.target as Element : null;
      const target = element?.closest<HTMLElement>("[data-anchor-id]");
      if (target?.dataset.anchorId) onAnchorHoverEnd();
    };
    document.addEventListener("selectionchange", readSelection);
    document.addEventListener("pointerup", readSelection, true);
    document.addEventListener("keyup", readSelection, true);
    document.addEventListener("click", click, true);
    document.addEventListener("pointerover", pointerOver, true);
    document.addEventListener("pointerout", pointerOut, true);

    const surface: ArticleSurfaceAdapter = {
      clearSelection: () => frameWindow.getSelection()?.removeAllRanges(),
      find: () => updateSearch(document),
      getTitle: () => article.title,
      getVisibleText: () => [...document.querySelectorAll<HTMLElement>("[data-rg-block-id]")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const frameRect = frame.getBoundingClientRect();
          return frameRect.top + rect.bottom >= 64 && frameRect.top + rect.top <= window.innerHeight;
        })
        .map((element) => article.blocks.find((block) => block.id === element.dataset.rgBlockId)?.text)
        .filter(Boolean).join(" ").slice(0, 3200),
      revealAnchor: (anchorId) => {
        const anchor = anchors.find((candidate) => candidate.id === anchorId);
        if (!anchor) return;
        document.querySelector(`[data-rg-block-id="${CSS.escape(anchor.blockId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    };
    setArticleSurface(surface);
    cleanupRef.current = () => {
      observer.disconnect();
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      document.removeEventListener("selectionchange", readSelection);
      document.removeEventListener("pointerup", readSelection, true);
      document.removeEventListener("keyup", readSelection, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerover", pointerOver, true);
      document.removeEventListener("pointerout", pointerOut, true);
      setArticleSurface(undefined);
    };
  }, [anchors, article.blocks, article.title, onAnchorHoverEnd, onAnchorHoverStart, onAnchorPress, onLinkOpen, onSelectionChange, updateSearch]);

  useEffect(() => () => cleanupRef.current(), []);

  useEffect(() => {
    if (!revealedAnchorId || !loadedDocument) return;
    const anchor = anchors.find((candidate) => candidate.id === revealedAnchorId);
    if (anchor) loadedDocument.querySelector(`[data-rg-block-id="${CSS.escape(anchor.blockId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [anchors, loadedDocument, revealedAnchorId]);

  return (
    <iframe
      ref={frameRef}
      className="imported-page-frame"
      title={`Static snapshot of ${article.title}`}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={article.snapshotHtml}
      style={{ height }}
      onLoad={handleLoad}
    />
  );
}
