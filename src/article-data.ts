import type { ArticleDocument } from "./types";

export const defaultArticle: ArticleDocument = {
  id: "demo-ev-transition",
  title: "Is the electric vehicle transition accelerating again?",
  deck: "One optimistic number can carry several different stories. Select a claim to open up its evidence, causes, and counterpoints.",
  author: "Living Page Briefing",
  publishedAt: "2026-09-01",
  siteName: "MOBILITY · MARKET SIGNALS",
  blocks: [
    {
      id: "opening",
      kind: "p",
      text: "The electric vehicle market has entered a more complicated phase. Global adoption continues to rise, but headline numbers can hide sharp differences between regions, price segments, and policy environments.",
    },
    {
      id: "claim-growth",
      kind: "quote",
      text: "Global EV sales increased by 20% year over year, suggesting the transition has regained momentum.",
    },
    {
      id: "market-context",
      kind: "p",
      text: "Lower battery costs, expanding model choice, and purchase incentives are frequently cited as the main drivers. Yet each explanation depends on where the boundary is drawn and which vehicles are counted.",
    },
    {
      id: "regional-gap",
      kind: "p",
      text: "Growth is not evenly distributed. Some markets accelerated after new subsidies, while others slowed as incentives expired and charging infrastructure lagged behind demand.",
    },
    {
      id: "questions-heading",
      kind: "h2",
      text: "A number is not yet an explanation",
    },
    {
      id: "research-need",
      kind: "p",
      text: "A useful reading of the market must connect the claim to primary data, explain the mechanism behind the change, and preserve credible counterpoints. Otherwise, a precise-looking statistic can create more confidence than understanding.",
    },
  ],
};
