# Research Garden progress

Original prompt: 添付の開発指示書を起点に、Canvasではなく閲覧中の文章へAnchorされたResearch Layerとして実装を進める。

## 2026-09-01 — Loop 1

- 完了: 空リポジトリとブランチ状態を確認。Anchor型MVPの受け入れ条件、React/Vite構成、Research data model、履歴モデルを確定。
- 未完: UI、WebMCP登録、ブラウザ検証。
- 次アクション: Article selection、Research Rail、WebMCP bridgeを実装する。

## 2026-09-01 — Loop 2

- 完了: Article selection、文章Anchor、Research Rail、Branch cards、Source detail、操作単位Undo/Redo、localStorage永続化を実装。`get_page_context`、`get_research_layer`、`create_research_nodes`、`add_research_source`を登録。
- 検証: `npm run build`成功。`npm run lint`はエラー0、Fast Refresh警告1。
- 未完: WebMCP経由E2E、実画面確認、警告解消。
- 次アクション: 実ツールexecuteを通すE2Eと視覚確認を行い、回帰を修正する。

## 2026-09-01 — Loop 3

- 完了: WebMCPホストを注入した実ブラウザで、文章選択→Anchor→`get_research_layer`→Agent gap判断→`create_research_nodes`→3 Branch表示→Source詳細→一括Undo/Redo→Reload復元を確認。Floating Actionの画面外表示、Undo後のDetail再表示、Source URL protocol、別Anchor親参照を修正。READMEとMIT Licenseを追加。
- 検証: unit 2/2、Playwright E2E 1/1、ESLint警告・エラー0、TypeScript/Vite production build成功、`git diff --check`成功、ブラウザconsole error 0。
- 未完: ChatGPT in-app browser等の実WebMCPクライアントからの外部呼び出し、公開デプロイ、公開YouTubeデモ、Devpost提出。
- 次アクション: WebMCP対応ブラウザでライブツールを呼び、公開URLへデプロイしてChallenge提出素材を作る。
