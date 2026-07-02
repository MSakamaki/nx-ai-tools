# Privacy and Data Policy

## ⚠️ prompt本文とAI応答本文をマスクせず保存すること

**このパッケージは、プロンプト本文（`promptBody`）とAI応答本文（`responseBody`）を、マスク・削除・要約せずそのまま `.ai/metrics/events/**/*.jsonl` に保存します。**

これは意図的な設計判断です。AI活用の改善（特にプロンプトの改善）を議論するには、実際に何を送信し、何が返ってきたかという本文そのものが必要になるためです。マスクされた本文では、振り返りや議論の材料として機能しません。

導入する前に、この方針を理解し、チーム内で合意した上で運用してください。

## 保存されるデータ一覧

各イベントには次の情報が含まれます（詳細な型定義は [event-schema.md](event-schema.md) を参照）。

- プロンプト本文（`promptBody`）
- AI応答本文（`responseBody`）
- トークン使用量（input / output / cache-read / cache-write / total）
- providerが報告する生のモデル識別子（`modelRaw`）
- 処理結果（`status`）、処理時間
- agent/skillの使用状況（名称・種別・ソースパス）
- git情報（`git user.name`、ブランチ、`baseCommitHash`、`commitHash` など）
- 正規化前の生payload（`rawEvent`）— **正規化済みイベント（`promptBody`/`responseBody`などに反映済み）でも保持され、Copilotの未知イベント（`raw_event`）では唯一の情報源になります。** `providers.copilot.rawEvent.enabled`（`metrics.config.json`）で保持自体を止められ、`maxBytes`（デフォルト1MB）を超える場合は切り詰められます（`rawEventTruncated: true`）

## 保存されないもの / 初期版で扱わないもの

- 記録されたデータの外部送信・アップロードは行いません（後述）
- プロンプト・応答本文の自動マスキング・自動検知（機密情報の自動検出など）は行いません
- セーフティ判定・危険操作のブロッキングは行いません（別パッケージの責務）
- 個人の評価・査定を目的としたスコアリングや自動レポーティングは行いません
- Copilotについては、標準的なテレメトリ取得手段がまだ無いため、プロジェクト側が自分のイベント源（VS Code拡張・カスタムスクリプトなど）を配線する「project hooks template」としての提供です。実際に何が取得できるかは、その配線内容に完全に依存します（[provider-strategy.md](provider-strategy.md) 参照）

## git commit対象 / gitignore対象の区別

| パス | git方針 | 理由 |
| --- | --- | --- |
| `.ai/metrics/metrics.config.json` | **commit対象** | チームで共有する設定 |
| `.ai/metrics/hooks/claude-code-hook.mjs` | **commit対象** | Claude Codeが実行するhookスクリプト、チームで共有 |
| `.ai/metrics/claude-code/README.md` | **commit対象** | Claude Code連携の説明 |
| `.github/hooks/ai-metrics.json` | **commit対象** | Copilotが直接読む想定のhook設定。ファイル名固定 |
| `.ai/metrics/hooks/copilot-hook.mjs` | **commit対象** | Copilot向けhookが実行するラッパースクリプト、チームで共有 |
| `.ai/metrics/copilot/{README.md,adapter.config.json,sample-event.json}` | **commit対象** | Copilot連携の設定・説明・サンプル |
| `.ai/metrics/events/**/*.jsonl` | **commit対象** | 生のイベントログ（`rawEvent` を含む）。他のcommit履歴と同様に、履歴として共有・レビューされることを前提とする |
| `.ai/metrics/generated/summary.json` | **gitignore（推奨）** | `report build` の派生出力。イベントログから常に再生成可能 |
| `.ai/metrics/generated/sessions.json` | **gitignore（推奨）** | 同上 |

**`events/**/*.jsonl` はgit commit対象であるため、そこに書かれた内容（プロンプト本文・AI応答本文を含む）はリポジトリの履歴に残ります。** リポジトリへのアクセス権を持つ全員がこのデータを読める状態になる、という点を必ず理解した上で導入してください。

`ai-metrics init` は `.ai/metrics/generated/` を自動的に `.gitignore` に追加しますが、`events/` ディレクトリはあえて手を加えません（trackableな状態のままにする）。

## 外部送信しないこと

このパッケージは、記録したイベントやレポートをいかなる外部サービス・APIにも送信しません。すべての処理はローカルファイルシステム上で完結します（`report serve` もローカルのHTTPサーバーであり、外部に公開する用途は想定していません）。

## セキュリティブロックは別パッケージの責務であること

このパッケージのhooksは**計測のみ**を行います。危険なコマンドの実行を止める、機密情報の送信を検知してブロックするといった機能は、このパッケージのスコープ外です。そのような安全機構が必要な場合は、別のパッケージ・別の仕組みと併用してください。

## チーム導入時の注意

- 導入前に、チーム内で「このデータをどう使うか」（プロンプト改善の議論に使う、個人評価には使わない、など）を明文化しておくことを推奨します
- リポジトリへのアクセス権がある人は誰でもプロンプト・応答本文を読める状態になることを、導入前にメンバー全員に周知してください
- 機密情報や顧客データを含むプロンプトを送信する可能性がある環境では、`.ai/metrics/events/` の共有範囲（リポジトリの公開範囲・アクセス権）を事前に見直してください
- `showPromptBody` / `showResponseBody`（`metrics.config.json`）は、`report serve` のUI/APIでの表示・非表示を制御するだけで、JSONLファイルへの書き込み内容自体は変わりません。この設定を `false` にしても、リポジトリの履歴からは本文を読めることに変わりはありません
- Copilotの `rawEvent` は、正規化できたフィールド（`promptBody` など）以外にも、イベント源が送ってきた内容がそのまま含まれます。イベント源の実装次第でプロンプト・応答本文相当の情報が `rawEvent` にしか残らないケースもあるため、`showPromptBody` / `showResponseBody` を `false` にしても `rawEvent` 経由で本文相当の情報が見える可能性がある点に注意してください。保持自体を止めたい場合は `providers.copilot.rawEvent.enabled: false` を使用してください
