export interface ArticleSurfaceAdapter {
  clearSelection(): void;
  find(query: string): number;
  getTitle(): string | undefined;
  getVisibleText(): string;
  revealAnchor(anchorId: string): void;
}

let activeSurface: ArticleSurfaceAdapter | undefined;

export function setArticleSurface(surface?: ArticleSurfaceAdapter) {
  activeSurface = surface;
}

export function getArticleSurface() {
  return activeSurface;
}

export function nativeArticleSurface(): ArticleSurfaceAdapter {
  const blocks = () => [...document.querySelectorAll<HTMLElement>("[data-block-id]")];
  return {
    clearSelection: () => window.getSelection()?.removeAllRanges(),
    find: (query) => {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return 0;
      const matches = blocks().filter((element) => element.textContent?.toLocaleLowerCase().includes(needle));
      matches[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return matches.length;
    },
    getTitle: () => document.querySelector<HTMLElement>("[data-article] h1")?.textContent?.trim(),
    getVisibleText: () => blocks()
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom >= 64 && rect.top <= window.innerHeight;
      })
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 3200),
    revealAnchor: (anchorId) => {
      document.querySelector(`[data-anchor-id="${CSS.escape(anchorId)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  };
}
