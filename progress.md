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

## 2026-09-02 — Living Page Loop 2

- 完了: ユーザー実機確認で判明した画像非表示、Anchor削除不可、Research / Visualization Card削除不可、閉じたCanvasがAgent更新で開かない問題を修正した。
- 完了: `image_board` Canvas Type、実画像、タイトル、Note、Source link、拡大Previewを実装。Image URLとSource URLはHTTP(S)のみ許可し、Agentの`create_visualization` / `update_visualization`で生成できるようにした。
- 完了: Article上のAnchor削除、Research Anchor削除、Research Card削除、Diagram / Timeline / Image Card削除を追加。Anchor削除は関連Inline Layer、子Research Card、SourcesへCascadeし、すべてUndo可能にした。
- 完了: AgentがVisualizationを作成・更新したとき、ユーザーが閉じていたVisual Thinking Canvasを自動で開くようにした。Inline専用Anchorは内部参照として保持しつつ、Research Canvasには空カードを出さないようにした。
- 検証: unit 9/9、Playwright E2E 4/4、ESLint、TypeScript、Sites production build、`git diff --check`成功。Playwright CLIでCanvas close→Agent Image Board→自動open、画像表示、拡大、個別削除、console error 0を確認した。
- 未完: Staged Agent Changes、Profile UI、Chart / Pros-Cons / Visual Summary、高度なDynamic Tool Availability、公開環境のWebMCPライブ呼び出し。
- 次アクション: ユーザーの通常ブラウザとWebMCP対応ブラウザでImage Boardと削除Undoを再確認し、その後Staged Changesへ進む。

## 2026-09-02 — Living Page Loop 3

- 完了: インポート記事の本文リンクを保持するようにした。Readabilityへ渡す前に原典URLの`<base>`を適用し、相対URLがlocalhostへ解決される不具合を修正。ブロック本文の文字オフセット範囲としてリンクを保存し、HTTP(S)以外と同一ページ内アンカーは除外する。
- 完了: 記事中リンクのクリックで、右側にLink Peek readerを開くようにした。同じ抽出・安全性チェックで本文を読め、Research Layerには一切影響しない。読んだ先からさらにリンクを辿れ、戻る操作、原典を新規タブで開く操作、「Study this page in the garden」で主記事へ昇格する操作を用意した。
- 検証: unit 10/10、Playwright E2E 4/4、ESLint、TypeScript、production build、`git diff --check`成功。実ブラウザでWikipedia記事をインポートし、284本のリンク描画、Peek表示、ネスト遷移と戻る、抽出不能ページのエラー表示、リンクを跨いだ選択でもAnchorオフセットが一致することを確認した。
- 完了: エージェントへの依頼口をAsk Bar 1本へ統一した。選択メニューはAnchor作成・文面投入・クリップボードコピーまでを1クリックで行い、バーには`[Simplify] "選択文"`のChipと状態表示、`Copy request` / `Copied`のボタンが出る。右パネルの`Copy agent request`カードと日本語専用プロンプトを廃止し、Guardrail入りの単一プロンプトに統合した。
- 完了: 右パネルをLayers / Canvasの2タブへ分割。LayersはすべてのAnchorをExplained / Simplified / Highlighted / Verified / n research cardsのバッジ付きで常時表示し、Inline結果が入ってもカードは消えない。行クリックで本文の該当箇所へスクロールしフラッシュする。CanvasはResearch / Diagram / Timeline / Compare / Imagesを保持し、Agentの更新は該当タブを自動で開く。
- 検証: unit 10/10、Playwright E2E 4/4、ESLint、TypeScript、production build、`git diff --check`成功。実ブラウザでSimplify 1クリック→Chip・コピー・Waiting for your agentバッジ→Agent適用後もカードが残りSimplifiedバッジと本文Inline Layerが揃うこと、research card追加、Canvasタブのresearch graph表示、console error 0を確認した。
- 未完: Staged Agent Changes、Accept / Inspect、Profile UI、Chart / Pros-Cons / Visual Summary、公開環境でのWebMCPライブ呼び出し。
- 次アクション: Sitesへ再デプロイし、公開URLとWebMCP対応ブラウザでAsk Bar一本化とLink Peekを再確認する。

## 2026-09-02 — Living Page Loop 5

- 完了: Canvas Type `map`を追加し、場所を含む問いにAgentが実地図で答えられるようにした。Leaflet + OpenStreetMapラスタータイルによる本物のSlippy Mapで、Marker（label / note / source link / sourceNodeIds）を番号付きPinとLegendの両方に表示し、どちらを選んでも該当地点へ移動してResearch Cardを開く。
- 完了: `create_visualization` / `update_visualization`を`map`対応にし、Marker再送なしで視点だけ動かす`set_map_view`（center / zoom / focusMarkerId）を追加した。
- 完了: 位置の認識を双方向にした。`get_canvas_state`と`get_visible_page_context`が現在のViewport（center、zoom、bounds、画面内Marker）を返すため、Agentは回答前に読者がどこを見ているかを読める。
- 安全性: 座標はAgentが与える設計とし、ページ側でのGeocodingと端末位置情報の取得は行わない。緯度-90〜90、経度-180〜180、Label必須、id重複禁止、Marker上限250、source URLはHTTP(S)のみを検証し、PopupはAgent提供テキストをDOMノードとして組み立ててHTML注入を避けた。タイル出典表示はLeafletのattributionで常時表示する。
- 完了: 選択メニューへMapプリセットを追加し、Ask Barのプロンプトに「Markerには実WGS84座標を自分で用意する」ガードレールを追記した。Canvas切替は6タブを1行に収めた。
- 検証: unit 12/12、Playwright E2E 5/5、ESLint、TypeScript、production build成功。E2Eはタイルサーバをstubし、Marker描画、Viewport報告、`set_map_view`によるFly、読者操作のズーム、Marker削除とUndo、console error 0を確認した。実ブラウザでも実タイル表示とPin / Legendの見た目を確認した。
- 未完: Staged Agent Changes、Profile UI、Chart / Pros-Cons / Visual Summary、公開環境でのWebMCPライブ呼び出しとMap Canvasの実機確認。
- 次アクション: Sitesへ再デプロイし、WebMCP対応ブラウザで`create_visualization(type:"map")`と`set_map_view`をライブ実行して確認する。

## 2026-09-02 — Living Page Loop 6

- 完了: 選択メニューのクリックをクリップボードコピーからページ内Request Queueへの投入に変えた。読者は記事を読みながらExplain / Simplify / Visualize / Map / Research / Verifyを複数か所に付けておき、チャットには最後に一度だけ「Process my marks.」と言う。マーク時のクリップボード書き込みは完全に廃止した。
- 完了: WebMCPへ`get_pending_requests`と`resolve_request`を追加した。前者はキューを投入順に返し、各項目のrequestId、anchorId、正確な引用、前後文脈、intentに合うツール候補、そのAnchorに既に付いているLayerとResearch Card数を含む。後者は1件ずつdone / skippedで消し込み、一行サマリとappliedToを残す。`get_page_context`と`get_visible_page_context`にも`pendingRequestCount`を追加した。
- 完了: 右パネルをLayers / Queue / Canvasの3タブへ拡張した。QueueタブはHandoff文の提示と全文プロンプトのコピー、未処理リストの引用・intent・prompt表示、行クリックで本文へスクロール、個別削除、Agent既読表示、Resolved履歴とClearを持つ。Ask Barは`Copy request`から`Add to queue`へ変え、未処理件数のPillを出す。
- 設計: Queue状態はResearch Documentの外に置いた。マークしてもgraph revisionが進まないため、Agentが保持する`baseRevision`を壊さず、Research用のUndo Stackにも積まれない。Anchorの削除・Undoで宙に浮いたRequestは`withLiveRequests`で自動的に落とす。二重解決は`already done`エラーで拒否する。
- 検証: unit 18/18、Playwright E2E 6/6、ESLint、TypeScript、production build成功。新規E2Eは3か所を別intentでマークし、クリップボードが空のままであること、`get_pending_requests`が3件を順序どおり返すこと、Agent既読表示、explain / verifyの適用と1件skip、pendingが0になること、Reload後もResolved履歴が残りClearできること、console error 0を確認した。
- 未完: Staged Agent Changes、Profile UI、Chart / Pros-Cons / Visual Summary、公開環境でのWebMCPライブ呼び出しとRequest Queueの実機確認。
- 次アクション: Sitesへ再デプロイし、WebMCP対応ブラウザで複数マーク→一言依頼→キュー消し込みをライブ実行して確認する。

## 2026-09-02 — Living Page Loop 7

- 設計: Anchorを人間専用のままにするか検討し、「人間の依頼から派生する場合に限りAIも打てる」方式を採用した。読者がまだ気づいていない箇所（記事全体への問い、根拠が別段落にある場合、網羅的な検証）は人間の選択だけでは表現できないが、Agentの自律Anchorは「Layersが自分の注意の記録である」という前提を壊すため、起点は常に人間の未処理Requestに固定した。
- 完了: `PendingRequest.anchorId`をnullableにし、Ask Barで何も選択していないときの入力を記事スコープのRequestとしてキューへ入れられるようにした。Queueカードは「Whole article · your agent anchors what it answers」と表示し、Anchor削除でも落ちない。
- 完了: WebMCPへ`anchor_passage`と`get_article_blocks`を追加した。前者は未処理の`requestId`必須で、Agentは引用文だけを渡し、ページ側が空白差を吸収してBlock内の位置・prefix・suffixを解決する。記事に存在しない引用は拒否するため、捏造した文をAnchorにできない。1 Requestあたり上限10件、`occurrence`と`blockId`で重複箇所を指定できる。読者自身のAnchorと一致する場合は複製せず既存Anchorを返す。
- 完了: `ResearchAnchor`へ`createdBy`と`requestId`を追加し、保存済みデータのAnchorは読み込み時に`human`へ移行する。Layersタブで「Agent anchored」バッジを表示し、削除・Cascade・Undoは既存のAnchorと同一経路にした。`get_pending_requests`は`scope`、`scopeNote`、`derivedAnchorIds`、`anchorBudgetLeft`を返し、Handoff Promptにも記事スコープの手順を追記した。
- 検証: unit 25/25、Playwright E2E 8/8、ESLint、TypeScript、production build、`git diff --check`成功。新規E2Eは選択なしの依頼→`get_article_blocks`→`anchor_passage`→`add_verification`→`resolve_request`を実ツールで通し、Offset一致、Agent帰属、捏造引用の拒否、未登録requestIdの拒否、解決後の再Anchor拒否、Reload復元、Undoを確認した。実ブラウザでも記事スコープ依頼→Agent Anchor→Inline Verification→「Agent anchored」バッジ表示とconsole error 0を確認した。
- 未完: Staged Agent Changes、Profile UI、Chart / Pros-Cons / Visual Summary、公開環境でのWebMCPライブ呼び出しと`anchor_passage`の実機確認。
- 次アクション: Sitesへ再デプロイし、WebMCP対応ブラウザで記事全体への依頼をライブ実行してAgent Anchorを確認する。

## 2026-09-02 — Living Page Loop 8

- 設計: fable提案のサンドボックス実行Canvasを採用し、Canvas Type `interactive`として実装した。エージェントが自己完結HTML+JSを送り、ページは隔離iframeで実行する。Artifacts / Canvasと同じ方式のため、審査員へ一文で説明できる。
- 完了: `create_visualization` / `update_visualization`を`interactive`対応にした。`data.interactive`は`id` / `title` / `note` / `sourceNodeIds` / `html`。Canvas切替へ「Interact」タブを追加し、Reset（フレーム再構築）、Remove、Undoを用意した。
- 安全性: `sandbox="allow-scripts"`のみを付与し`allow-same-origin`を与えないため、iframeはopaque originとなり親のDOM・localStorage・Cookieへ触れない。srcdoc内のCSP metaは`default-src 'none'`で、fetch・外部script / stylesheet・外部画像 / font・form送信をすべて遮断する。読み込めないと分かっている外部参照（script / link / iframe / object / embedのhttp(s)・protocol-relative URL）はツール境界で拒否し、HTMLは60,000文字上限とした。
- 完了: 双方向にした。フレーム内の`livingPage.setState(value)`が`postMessage`で親へ値を渡し、親は`event.source`一致とJSON 4,000文字上限を検証して保持する。`get_canvas_state`が`interactiveState`として、`get_visible_page_context`も同じ値を返すため、エージェントは読者が動かしたスライダーの位置から答えられる。`readerFocus`もInteractive Canvasを報告する。
- 設計: Map Viewportと同じく、読者の操作状態はResearch Documentの外（モジュール内シングルトン）に置いた。revisionを進めず、Undo Stackにも載らず、フレーム破棄・Reset・Removeで消える。
- 完了: フレームは自分の高さを`ResizeObserver`で報告し、親が140〜1,200pxへclampする。フレーム内のエラーはカード下に表示する。
- 検証: unit 34/34、Playwright E2E 9/9、ESLint、TypeScript、production build成功。新規E2Eはエージェントがスライダーwidgetを送り、読者としてスライダーを操作し、`get_canvas_state`で値と「親document・localStorageへ到達できない」自己プローブを読み戻し、外部script参照の拒否、Resetでの状態クリア、Remove→Undoを確認した。console error 0。
- 未完: Staged Agent Changes、Profile UI、Chart / Pros-Cons / Visual Summary、公開環境でのWebMCPライブ呼び出しとInteractive Canvasの実機確認。
- 次アクション: Sitesへ再デプロイし、WebMCP対応ブラウザで`create_visualization(type:"interactive")`をライブ実行して、読者操作→`get_canvas_state`の往復を確認する。
