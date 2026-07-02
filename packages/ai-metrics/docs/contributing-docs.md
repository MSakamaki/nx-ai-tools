# Contributing: Docs Update Rules

このドキュメントは、`@nx-ai-tools/ai-metrics` に対する実装変更を行う際に、**どのドキュメントを更新すべきか**を判断するためのルールです。人間のcontributorだけでなく、AI Agentによる実装変更でも同じ基準で判断できるように、変更の種類ごとに「更新対象ファイル」を明示します。

**原則: コードとドキュメントは同じPR内で更新する。** ドキュメント更新が後回しになったPRは、レビュー時にリジェクトされる可能性があります。

このドキュメントの対象は、リポジトリ内の以下のファイル群です。

- `packages/ai-metrics/README.md`
- `packages/ai-metrics/docs/*.md`（このファイル自身を除く）
- ルートの `.github/pull_request_template.md`

## 変更の種類ごとの更新対象

### 1. CLIコマンドを変更した場合

対象: `src/cli/index.ts`、`src/cli/commands/*.ts` の変更（新規コマンド追加、既存コマンドのオプション追加・変更・削除、出力内容の変更、終了コードの変更など）。

- 更新必須: [README.md](../README.md) の「主要コマンド」表・「クイックスタート」（コマンド名やオプションが変わった場合）
- 更新必須（該当する場合）:
  - [event-schema.md](event-schema.md)（`report build` の不正行処理など、CLIの挙動がスキーマ処理に関わる場合）
  - [metrics.md](metrics.md)（`report build` / `report serve` の出力内容が変わった場合）
  - [privacy-and-data-policy.md](privacy-and-data-policy.md)（`init` が触るファイル・`.gitignore` の扱いが変わった場合）
- チェック方法: `ai-metrics --help` の出力（`src/cli/index.ts` のUsage文字列）とREADMEの記述が一致しているか確認する

### 2. jsonl schemaを変更した場合

対象: `src/core/types.ts` の `MetricsEvent` 関連の型、`SCHEMA_VERSION` の変更。

- 更新必須: [event-schema.md](event-schema.md)（フィールド追加・変更・削除、`schemaVersion` の値、イベント種別ごとの追加フィールド表）
- 更新必須（該当する場合）:
  - [metrics.md](metrics.md)（スキーマ変更が集計結果に影響する場合）
  - [README.md](../README.md)（公開APIの入出力型に影響する場合）
  - [privacy-and-data-policy.md](privacy-and-data-policy.md)（新しく保存されるようになったフィールドが個人情報・機密情報を含みうる場合、「保存されるデータ一覧」に追加）
- **`schemaVersion` を上げる変更**（互換性のない変更）を行った場合は、[event-schema.md](event-schema.md) の該当バージョンの記述に加えて、[roadmap.md](roadmap.md) に移行の背景を追記することを検討する
- 判断基準: 既存の `.jsonl` ファイル（過去に記録されたイベント）を新しいコードで読んだときに、意味が変わる・読めなくなるフィールドがあれば、それは「schema変更」として扱う

### 3. metricsを追加/変更した場合

対象: `src/report/aggregate.ts`（`MainMetrics` の計算ロジック）、`src/core/types.ts` の `MainMetrics` / `ReportSummary` / `ReportSession` / `ReportAction`。

- 更新必須: [metrics.md](metrics.md)（指標の追加・削除、計算式の変更、breakdown軸の追加・削除）
- **計算式を変更した場合は、必ず実装コード（`aggregate.ts`）を読んでから記述する。** 「〜のような値」といった推測での記述は禁止。分子・分母・nullになる条件を正確に書く
- 更新必須（該当する場合）:
  - [README.md](../README.md)（Public APIの `buildReport` の出力に説明が必要な変更が含まれる場合。通常は詳細をREADMEに書かず、metrics.mdへリンクする）
- チェック方法: 新規・変更した指標について、「観測できなかった場合に `null` になるか」を必ず確認し、そのルールをmetrics.mdに明記する（[concept.md](concept.md) の「推定せず、nullで保持する」原則に従う）

### 4. provider adapterを追加/変更した場合

対象: `src/providers/claude-code/*`、`src/providers/copilot/*`、または新規provider追加（`src/providers/<name>/*`）。

- 更新必須: [provider-strategy.md](provider-strategy.md)（対応状況、取得可能な情報の粒度、`sourceAvailability` の扱い）
- 更新必須: [README.md](../README.md) の「Provider対応状況」表（新規provider追加時、またはstatus変更時: `initial support` ⇄ `experimental` ⇄ 対応終了 など）
- 更新必須（該当する場合）:
  - [architecture.md](architecture.md)（新規providerディレクトリを追加した場合、package構造図に追記）
  - [event-schema.md](event-schema.md)（`toolProvider` の取りうる値が増えた場合、`GitContext` / `AgentInfo` などprovider固有の解釈が必要な場合）
  - [roadmap.md](roadmap.md)（Next/Futureに記載していた項目が実現した場合、該当項目を削除・更新する）
- **新規providerのステータス（`initial support` / `experimental`）を決める基準**: 実際のテレメトリ取得手段が存在し日常的に動作する場合は `initial support`、`ProviderAdapter` 契約のみを満たすインターフェースの場合は `experimental`（`./experimental` からのみexport）。この基準に一貫性を持たせ、READMEとprovider-strategy.mdで表現を揺らさないこと

### 5. privacy/data policyに影響する変更をした場合

対象: 保存されるフィールドの追加・削除、保存先パスの変更、`.gitignore` の扱いの変更、`showPromptBody` / `showResponseBody` など表示制御設定の追加・変更、外部送信を伴う機能の追加（想定されていないが、行う場合は特に重要）。

- 更新必須: [privacy-and-data-policy.md](privacy-and-data-policy.md)（保存されるデータ一覧、git commit/gitignore対象表、チーム導入時の注意）
- 更新必須: [README.md](../README.md) の「⚠️ インストール前に必ず確認してください」セクション（保存データの一覧に変更がある場合）
- **本文（prompt/response）のマスク方針を変更する場合は特に注意する。** 現在の方針は「マスクしない」であり、これを変更する場合は [concept.md](concept.md) の設計原則、[privacy-and-data-policy.md](privacy-and-data-policy.md)、READMEの警告文の3箇所を必ず同時に更新する（1箇所だけ変更して矛盾した記述を残してはならない）
- 判断基準: 「この変更によって、リポジトリに新しく残る情報は何か」「その情報を見て困る人はいないか」を自問し、Yesであれば必ずこのセクションの更新が必要

### 6. release workflowを変更した場合

対象: `.github/workflows/ci.yml`、`.github/workflows/version.yml`、`.github/workflows/publish.yml`、`package.json` の `exports` / `publishConfig` / `engines`。

- 更新必須: [release.md](release.md)（バージョニング手順、publishトリガー、CI/Publishワークフローが実行する内容、必要なSecrets）
- 更新必須（該当する場合）:
  - [README.md](../README.md)（`Node.js >=22` などのバージョン要件が変わった場合）
- チェック方法: release.mdに書かれているワークフローのステップ一覧が、実際の `.yml` ファイルの `steps` と一致しているか、変更後に読み比べて確認する

### 7. public APIを変更した場合

対象: `src/index.ts` からexportされるもの（`recordEvent` / `loadConfig` / `createClaudeCodeAdapter` / `buildReport` など）の追加・削除・シグネチャ変更。

- 更新必須: [README.md](../README.md) の「Public API」セクション（import例、各関数の1行説明）
- 更新必須（該当する場合）:
  - [architecture.md](architecture.md)（`core` / `report` / `config` 層の責務が変わった場合）
  - [release.md](release.md)（SemVerの章。破壊的変更であればメジャーバージョンアップが必要であることの確認）
- **破壊的変更（既存の関数シグネチャの変更・削除）を行う場合は、[release.md](release.md) のSemVer方針に従い、changesetでメジャーバージョンとして明示する。** ドキュメント上も「stable API」であることを踏まえた変更影響の記述が必要

### 8. experimental APIを変更した場合

対象: `src/experimental.ts` からexportされるもの（`createCopilotAdapter` / `recordEventAsync` / `buildReportAsync` など）の追加・削除・変更。

- 更新必須: [README.md](../README.md) の「Experimental API」セクション（該当する場合）
- 更新必須（該当する場合）:
  - [provider-strategy.md](provider-strategy.md)（Copilot adapterに関する変更の場合）
  - [roadmap.md](roadmap.md)（experimental機能が安定版に昇格する場合、Next/Futureの記述を更新・削除する）
- experimental APIはSemVerの通常保証の対象外なので、変更自体にメジャーバージョンは不要だが、**変更内容をCHANGELOG（changeset）に明記すること**は必須

## READMEに書くべきこと / docsに分けるべきこと

READMEは「利用者が最初に読む入口」であり、docsは「詳細を必要とする読者が読む」場所です。この境界を意識して更新すること。

| READMEに書くもの | docsに書くもの |
| --- | --- |
| 概要・導入判断に必要な最小限の情報（1〜3行） | 詳細な定義・仕様・計算式・背景 |
| インストール・クイックスタート | 各コマンドの全オプション・出力例（将来的にdocsへ分離予定） |
| 保存データに関する警告（プロンプト/応答を非マスクで保存する旨） | データポリシーの全詳細（[privacy-and-data-policy.md](privacy-and-data-policy.md)） |
| Provider対応状況の表（1行ずつ） | providerごとの実装詳細・adapter契約（[provider-strategy.md](provider-strategy.md)） |
| 公開APIの一覧と1行説明 | 内部構造・層ごとの責務（[architecture.md](architecture.md)） |
| 各docsへのリンク一覧 | 思想・Non-goals（[concept.md](concept.md)）、将来計画（[roadmap.md](roadmap.md)） |

**判断基準**: 「その情報がなければ導入判断ができない、あるいは重大な事故（機密情報の意図しない共有など）につながるか」→ README。「知りたい人だけが詳しく読めればよい情報か」→ docs。

**やってはいけないこと:**
- README内に、既にdocsにある表や説明をそのまま複製すること（差分が発生し、片方だけ更新されて矛盾する原因になる）。README側は要約＋リンクにする
- docsで書くべき詳細（計算式、フィールド一覧など）をREADMEに書き始めて肥大化させること

## ドキュメント更新チェックリスト

実装変更のPRを作成する前に、以下を確認する。

- [ ] 変更した内容に対応する「変更の種類ごとの更新対象」（本ドキュメントの1〜8）を確認し、該当する更新必須ドキュメントをすべて更新したか
- [ ] `docs/README.md` の目次・読者別ガイドに、新規ドキュメントや大きな役割変更を反映したか（新規docsファイルを追加した場合は必ず追記する）
- [ ] READMEとdocsの間で、Provider対応状況（`initial support` / `experimental` などの表現）に矛盾がないか
- [ ] READMEとdocsの間で、公開API一覧・experimental API一覧に矛盾がないか
- [ ] コード上の実際の挙動（関数名・オプション名・デフォルト値・計算式）とドキュメントの記述が一致しているか（推測で書いていないか、実装ファイルを読んで確認したか)
- [ ] 保存データ・git commit/gitignore対象に変更がある場合、[privacy-and-data-policy.md](privacy-and-data-policy.md) とREADMEの警告文の両方を更新したか
- [ ] schemaVersionを上げる変更の場合、[event-schema.md](event-schema.md) に明記したか
- [ ] 変更がNon-goals（[concept.md](concept.md)）に抵触しないか（抵触する場合は、実装ではなくスコープ自体を見直す）
- [ ] PRの説明文（[pull_request_template.md](../../../.github/pull_request_template.md)）の「docs更新の有無」欄に、更新したファイルを記載したか
