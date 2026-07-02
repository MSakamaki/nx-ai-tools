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
- 正規化前の生payload（`raw`）

## 保存されないもの / 初期版で扱わないもの

- 記録されたデータの外部送信・アップロードは行いません（後述）
- プロンプト・応答本文の自動マスキング・自動検知（機密情報の自動検出など）は行いません
- セーフティ判定・危険操作のブロッキングは行いません（別パッケージの責務）
- 個人の評価・査定を目的としたスコアリングや自動レポーティングは行いません
- Copilotについては、実データを取得する手段自体がまだ無いため、実質的にはインターフェースのみが存在する状態です（[provider-strategy.md](provider-strategy.md) 参照）

## git commit対象 / gitignore対象の区別

| パス | git方針 | 理由 |
| --- | --- | --- |
| `.ai/metrics/metrics.config.json` | **commit対象** | チームで共有する設定 |
| `.ai/metrics/hooks/claude-code-hook.mjs` | **commit対象** | Claude Codeが実行するhookスクリプト、チームで共有 |
| `.ai/metrics/events/**/*.jsonl` | **commit対象** | 生のイベントログ。他のcommit履歴と同様に、履歴として共有・レビューされることを前提とする |
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
