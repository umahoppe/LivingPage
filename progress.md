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

## 2026-09-01 — Loop 4

- 完了: Sites Workerへ`POST /api/import`を追加。公開HTMLをReadabilityでArticleDocumentへ変換し、URL入力UIから現在記事を切替可能にした。記事切替はResearch Layerを分離し、操作履歴からUndo可能。WebMCP contextに原典URL・記事ID・サイト名を追加。
- 安全性: localhost、private IPv4、local/internal host、資格情報付きURL、非標準port、非HTTP、非HTML、2MB超過、過剰Redirectを拒否。取得HTMLは構造化プレーンテキストへ変換し、Script/Form/Embedを描画しない。
- 検証: unit 4/4、Playwright E2E 2/2、ESLint成功、Sites production build成功。実ネットワークでWikipedia記事80 blocksを抽出し、private URL拒否HTTP 400を確認。
- 未完: 既存Sitesへの新版公開とデプロイ後確認。
- 次アクション: 正確に検証済みsourceを保存し、既存Sitesへ公開する。

## 2026-09-02 — Living Page Loop 1

- 完了: Research GardenをLiving PageのResearch Modeとして維持しながら、永続化データをversion 3へ拡張。Research Dataとは分離したLiving AnnotationとCanvas View Stateを追加し、version 2の保存データを自動移行するようにした。
- 完了: 文章選択時のExplain / Simplify / Visualize / Research / Verifyメニュー、小型AI Command Bar、Inline Explanation、Simplified Layer、意味的Highlight、Source付きVerification、LayerのCollapse / Removeを実装。Canvasを閉じて記事を広く表示できるようにした。
- 完了: Visual Thinking CanvasへResearch / Diagram / Timeline / Compareを追加。同じResearch Nodesを各Viewのfallback dataとして再利用し、Agent提供のVisualization dataも保存・表示できるようにした。
- 完了: `get_current_selection`、`get_visible_page_context`、`get_canvas_state`、`insert_inline_explanation`、`insert_simplified_layer`、`add_highlight`、`add_verification`、`create_visualization`、`update_visualization`を追加。既存WebMCP toolsは維持した。
- 検証: unit 7/7、Playwright E2E 3/3、ESLint、TypeScript、Sites production build成功。Playwright CLIの実画面で選択メニュー、Inline Layer、Diagram、Canvas close/reopenを確認し、console error 0。favicon 404も修正した。
- 未完: Staged Agent Changes、Accept / Inspect、Profile UI、Chart / Image Board / Pros-Cons / Visual Summary、高度なDynamic Tool Availability、公開環境のWebMCPライブ呼び出し。
- 次アクション: Challengeの実デモでは現在のGolden Pathを先に使用し、次ループでStaged ChangesとVisualization Type追加を行う。公開前にSitesへ再デプロイし、公開URL上でWebMCP登録と永続化を再検証する。
