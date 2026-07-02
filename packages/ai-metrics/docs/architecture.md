# Architecture

このドキュメントは `@nx-ai-tools/ai-metrics` の内部構造を、拡張・contributeしたい読者向けに説明します。利用者としてこのパッケージを使うだけであれば読む必要はありません。

## Nx monorepo内のpackage構造

`@nx-ai-tools/ai-metrics` は `nx-ai-tools` monorepo内の1パッケージ（`packages/ai-metrics`）として実装されています。

```
packages/ai-metrics/
├── src/
│   ├── core/            # 実処理（イベント記録、パス解決、git/user/repo-root情報の取得など）
│   ├── cli/
│   │   ├── index.ts             # CLI入口（引数解析）
│   │   ├── provider-selection.ts # --provider の解析・対話式チェックボックス選択
│   │   └── commands/             # init / init-claude-code / init-copilot / init-file-task /
│   │                              # doctor / doctor-checks / report-build / report-serve など
│   ├── config/           # metrics.config.json の読み込み・デフォルト値
│   ├── providers/
│   │   ├── claude-code/  # Claude Code adapter（initial support）
│   │   └── copilot/      # Copilot adapter（experimental / project hooks template）
│   ├── report/           # イベント集計・HTTPサーバ（build-report.ts / aggregate.ts / server.ts）
│   ├── report-ui/        # レポート表示用の静的HTML/CSS/JS
│   ├── schema/           # metrics.config.json のJSON Schemaとバリデーション
│   ├── templates/        # init が配置するファイルの雛形（claude-code/ と copilot/ に分離）
│   ├── index.ts          # 公開API (`.`)
│   └── experimental.ts   # experimental API (`./experimental`)
├── scripts/
│   └── copy-assets.mjs   # ビルド時にschema/templates/report-uiをdistへコピー
└── package.json
```

## src/core と src/cli の責務分担

- **`src/core`**: 実際の処理ロジックを持つ層。イベントの生成・JSONLへの追記、日付・ハッシュ計算、git情報の取得、repo root探索、パス解決などはすべてここに置きます。provider adapterやCLIコマンドはこの層の関数を呼び出すだけです。
- **`src/cli`**: `src/cli/index.ts` を入口とする薄い呼び出し層。`init` / `doctor` / `report build` / `report serve` の各コマンド（`src/cli/commands/`）は、引数解析・標準出力への表示・終了コードの決定を担い、実処理は `core` や `report` に委譲します。
  - `init.ts` はprovider共通の処理（ディレクトリ作成、`metrics.config.json`、`.gitignore`）のみを担当し、provider固有の生成処理は `init-claude-code.ts` / `init-copilot.ts` に委譲します。ファイルの上書きポリシー（`--force` / TTY確認 / 非TTY時はスキップ）は `init-file-task.ts` の `applyFileTask` に共通化されています
  - `provider-selection.ts` が `--provider` フラグの解析と、省略時の対話式チェックボックス選択（非TTY時は `claude-code` のみにフォールバック）を担当します
  - `doctor-checks.ts` の個々のチェックは、provider未指定時は「実際に設定されているprovider」を自動検出して実行し、`--provider` 指定時はそのproviderを強制的に対象にします（Copilotを明示指定した場合のみ、必須ファイルの欠落がERRORに昇格します）

この分離により、CLIを経由せずに `recordEvent` や `buildReport` などの関数を直接importして使うライブラリとしての利用が可能になっています（README記載の公開APIはすべて `core` / `report` / `config` 層の関数です）。

## providers/claude-code と providers/copilot のadapter構成

各providerディレクトリは共通のインターフェース（`ProviderAdapter`、`handleInput(input): MetricsEvent | undefined`）を実装します。

- **`providers/claude-code`**
  - `adapter.ts` — `createClaudeCodeAdapter` の実体。hookから渡される入力を受け取る
  - `normalize.ts` — Claude Code固有の入力形式をai-metricsの `MetricsEvent` に正規化。マッピングの無いhookイベントは `raw_event` として保持する
  - `hook-entry.ts` — `.ai/metrics/hooks/claude-code-hook.mjs`（薄いラッパー。`dist/providers/claude-code/hook-entry.js` を子プロセスとして起動する）から呼ばれるエントリポイント
  - `types.ts` — Claude Code hookの入力型
- **`providers/copilot`**
  - `adapter.ts` — `createCopilotAdapter`（typed、プログラム的統合用、experimental）と `createCopilotHookAdapter`（stdin JSON経由、`.ai/metrics/hooks/copilot-hook.mjs` から使われる）の2つを提供
  - `normalize.ts` — Copilotのbest-effortなイベント形式をai-metricsの `MetricsEvent` に正規化。マッピングの無いイベントは `raw_event` として保持する
  - `hook-entry.ts` — `.ai/metrics/hooks/copilot-hook.mjs` から呼ばれるエントリポイント。`createCopilotHookAdapter` は `providers.copilot.enabled` が `false` の場合や repo root が見つからない場合、記録をスキップする

新しいproviderを追加する場合は、`providers/<name>/` ディレクトリを追加し、同じ `ProviderAdapter` 契約を実装する形になります。詳細な方針は [provider-strategy.md](provider-strategy.md) を参照してください。

### hookスクリプトが「薄いラッパー」である理由

`claude-code-hook.mjs` / `copilot-hook.mjs` はいずれも、パッケージ本体を直接importするのではなく、`node_modules/@nx-ai-tools/ai-metrics/dist/providers/<name>/hook-entry.js` を `child_process.spawnSync` で子プロセス実行します。これは、パッケージ未インストール・破損などpackage解決自体が失敗するケースを含め、あらゆる失敗をラッパー側でWARN化してexit 0にするためです（直接importする設計だと、importの失敗自体はtry/catchで捕まえられず、hookプロセスがクラッシュしてしまいます）。

## templates / schema / report-ui の扱い

これらは TypeScript のコンパイル対象ではなく、実行時にそのまま必要とされる静的アセットです。

- **`src/templates/`**: `ai-metrics init` が配置するファイルの雛形。共通の `metrics.config.json` に加えて、provider別に `claude-code/`（`claude-code-hook.mjs`、`.claude/settings.json` へのマージパッチ、README）と `copilot/`（`copilot-hook.mjs`、`.github/hooks/ai-metrics.json` の雛形、`adapter.config.json`、`sample-event.json`、README）に分かれています
- **`src/schema/`**: `metrics.config.json` のJSON Schema（`metrics.config.schema.json`）と、それを使ったバリデーションロジック（`validate.ts` はTSなので個別にコンパイルされる）
- **`src/report-ui/`**: `report serve` が配信する静的なHTML/CSS/JS（Overview / Prompt View / Commit View / Provider / Model View / Agent / Skill View / Raw Events View）

## build時にdistへ含めるasset

`nx build ai-metrics` は通常の `tsc` によるコンパイルに加えて、`copy-assets` ターゲット（`scripts/copy-assets.mjs`）を実行します。これは `schema` / `templates` / `report-ui` ディレクトリの中身（`.ts` ファイルを除く）をそのまま `dist/` 配下にコピーします。`.ts` ファイル（例: `src/schema/validate.ts`）は通常のTS compileパスで別途処理されます。

`package.json` の `exports` フィールドでは、`./schema/metrics.config.schema.json` のように、コピーされたJSON Schemaを直接参照できるようにしています。

## report build / report serve の流れ

1. **`ai-metrics report build`**
   - `.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl` を全て読み込む
   - 各行をイベントスキーマに対してパース・検証（不正な行はデフォルトで警告付きskip、`--strict` 指定時は失敗）
   - `report/aggregate.ts` がセッション単位・各種軸（user/date/provider/providerEventName/model/commit/agent/skill/normalizationStatus）でメトリクスを集計し、`raw_event` も件数・`rawEvents[]`（生payload込み）としてセッションに保持する
   - `report/build-report.ts`（公開APIとしては `buildReport` / `buildReportAsync`）が集計結果を `.ai/metrics/generated/summary.json` と `sessions.json` に書き出す
2. **`ai-metrics report serve`**
   - サーバ本体（`report/server.ts` の `createReportServer`）を `cli/commands/report-serve.ts` から呼び出すだけの薄い構成
   - `report build` が生成した `summary.json` / `sessions.json` を読み込む読み取り専用のローカルHTTPサーバ（GET/HEADのみ）を起動
   - `src/report-ui` の静的アセットを配信し、`metrics.config.json` の `showPromptBody` / `showResponseBody` / `markdownRendering` に応じてAPIレスポンスの内容を調整する（`rawEvent` はこの非表示設定の対象外で、常にそのまま返される）
   - デフォルトで `localhost:4321`（`metrics.config.json` の `report.port` で変更可能、`--port` でも上書き可能）
