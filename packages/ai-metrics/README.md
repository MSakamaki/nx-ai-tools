# @nx-ai-tools/ai-metrics

AIコーディングアシスタント（Claude Code / Copilot）の利用状況を、ローカルの git 管理下 JSONL ログとして記録し、閲覧可能な使用状況レポートに変換するツールです。外部サービスへは一切送信されません。

`@nx-ai-tools/ai-metrics` は **public npm package** として公開されています。

> **Node.js `>=22` が必要です。**

## ⚠️ インストール前に必ず確認してください: このパッケージが保存するデータ

このパッケージは、AI支援コーディングセッションに関する情報を **そのまま（unmasked）** 記録することを前提に設計されています。`.ai/metrics/events/**/*.jsonl` に記録される各イベントには、次のものが含まれる可能性があります。

- **プロンプト本文** — AIに送信した文字通りのテキスト
- **AI応答本文** — AIが返した文字通りのテキスト/出力
- **トークン使用量** — input / output / cache-read / cache-write / total の各トークン数
- **`modelRaw`** — providerが報告する生のモデル識別子
- **実行時間**
- **`git user.name`** — セッションを行ったローカルgitユーザー
- **`branch`** — セッション実行時のgitブランチ
- **`commitHash`** — セッションの変更が最終的に含まれたcommit（判明時のみ）

**プロンプト本文とAI応答本文はマスク・削除・要約されず、そのまま保存されます。** 機密情報・認証情報・顧客データなどが含まれる可能性がある場合は、`.ai/metrics/events/` を他の機密ファイルと同様に取り扱ってください（共有前レビュー、リポジトリアクセス制限など）。詳細は [docs/privacy-and-data-policy.md](docs/privacy-and-data-policy.md) を参照してください。

`.ai/metrics/events/**/*.jsonl`（上記の本文を含む生イベントログ）は**git commit対象**です。一方、`report build` が生成する `.ai/metrics/generated/summary.json` / `sessions.json` はイベントログから常に再生成できるため**gitignore対象**（`ai-metrics init` が自動で `.gitignore` に追加）です。詳しい理由と一覧表は [docs/privacy-and-data-policy.md](docs/privacy-and-data-policy.md) を参照してください。

なお、hooksが行うのは記録（計測）のみです。危険な操作の検知やブロックはこのパッケージの責務ではありません。詳細は [docs/concept.md](docs/concept.md) を参照してください。

## Provider対応状況

| Provider    | Status                            | エントリポイント |
| ----------- | ---------------------------------- | ---------------- |
| Claude Code | **Initial support**               | `createClaudeCodeAdapter`（`@nx-ai-tools/ai-metrics`） |
| Copilot     | **Experimental / project hooks template** | `createCopilotHookAdapter`（`@nx-ai-tools/ai-metrics/experimental`） |

Copilotには標準的なhook機構が無いため、`.github/hooks/ai-metrics.json`（Copilot向けのイベント配線を宣言する設定）と `.ai/metrics/hooks/copilot-hook.mjs`（実際に呼ばれる薄いラッパー）を使った「project hooks template」として提供しています。イベント名のマッピングは `.ai/metrics/copilot/adapter.config.json` で調整可能です。認識できないイベントは `raw_event` としてそのまま記録され、破棄されません。詳細は [docs/provider-strategy.md](docs/provider-strategy.md) を参照してください。

## インストール

```sh
npm install @nx-ai-tools/ai-metrics
```

## クイックスタート

```sh
npx ai-metrics init
```

現在のプロジェクトに `.ai/metrics/` を作成します。`--provider` を省略した場合、TTYであれば対話式に、非TTYであれば `claude-code` のみを対象にセットアップします（既存のhooksや設定は保持されます）。

```sh
npx ai-metrics init --provider claude-code       # Claude Codeのみ
npx ai-metrics init --provider copilot           # Copilotのみ（experimental）
npx ai-metrics init --provider claude-code,copilot
```

```sh
npx ai-metrics report build
npx ai-metrics report serve
```

`report build` が `.ai/metrics/generated/summary.json` / `sessions.json` を生成し、`report serve` が `http://localhost:4321` でレポートUIを表示します。

## 主要コマンド

| コマンド | 概要 |
| --- | --- |
| `ai-metrics init` | `.ai/metrics/` の初期構築とprovider hookの登録（`--provider claude-code,copilot` / `--dry-run` / `--force` / `--yes`） |
| `ai-metrics doctor` | セットアップの読み取り専用診断（イベントは記録しない、`--provider` / `--json`） |
| `ai-metrics report build` | イベントログを集計し `summary.json` / `sessions.json` を生成（`--strict`） |
| `ai-metrics report serve` | レポートUIをローカルで配信（デフォルト `localhost:4321`、`--port`） |

`ai-metrics doctor --provider copilot` を指定した場合、`.github/hooks/ai-metrics.json` と `.ai/metrics/hooks/copilot-hook.mjs` の両方が存在しないとERROR（終了コード1）になります。`--provider` を省略した場合、Copilotは実際にセットアップされている場合のみ診断対象になります。

各コマンドの詳細なオプション・出力例は将来 `docs/cli.md` 等に切り出す予定です。現時点ではソースコード内のヘルプ（`ai-metrics --help`）を参照してください。

## Public API

```ts
import { recordEvent, loadConfig, createClaudeCodeAdapter, buildReport } from '@nx-ai-tools/ai-metrics';
```

- `recordEvent` — スキーマ準拠のイベントを `.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl` に追記
- `loadConfig` — `.ai/metrics/metrics.config.json` を読み込み（未存在時はデフォルト値）
- `createClaudeCodeAdapter` — Claude Codeのhook入力をai-metricsイベントに正規化
- `buildReport` — 記録済みイベントを集計し `summary.json` / `sessions.json` を生成

Experimental API（`@nx-ai-tools/ai-metrics/experimental`）は将来変更・削除される可能性があります。詳細は [docs/provider-strategy.md](docs/provider-strategy.md) を参照してください。

## Docs

詳細なドキュメントは [docs/README.md](docs/README.md) から参照できます。

- [docs/concept.md](docs/concept.md) — 思想・ゴール・Non-goals
- [docs/architecture.md](docs/architecture.md) — package内部構造
- [docs/event-schema.md](docs/event-schema.md) — イベントスキーマ仕様
- [docs/metrics.md](docs/metrics.md) — 取得・集計するメトリクス一覧
- [docs/provider-strategy.md](docs/provider-strategy.md) — provider対応方針
- [docs/privacy-and-data-policy.md](docs/privacy-and-data-policy.md) — データ・プライバシー方針
- [docs/release.md](docs/release.md) — 配布・publishフロー
- [docs/roadmap.md](docs/roadmap.md) — 将来計画

## Building / testing this package

- `nx build ai-metrics` — ライブラリのビルド
- `nx test ai-metrics` — [Vitest](https://vitest.dev/) によるユニットテスト
