# Metrics

このドキュメントは `ai-metrics report build` が生成する `summary.json` / `sessions.json` に含まれるメトリクスの一覧と定義です。イベントそのものの構造は [event-schema.md](event-schema.md) を参照してください。

## 集計の単位

- **session単位**: 1回のユーザー入力→AI応答のやり取り全体（`sessionId` で識別）
- **action単位**: session内の1回のAI応答/処理単位（`actionId` で識別、`action_started` / `action_completed` / `action_failed` の3イベントで構成される）
- **commit単位**: `git.commitHash` によって、そのcommitに含まれた変更に対応するsessionをグルーピングしたもの。`commitHash` が `null` のsessionは `Uncommitted` として別枠で扱われる

## 基本カウント指標

| 指標 | 説明 |
| --- | --- |
| `totalSessions` | 対象範囲内のsession数 |
| `totalActions` | 対象範囲内で完了（`action_completed` または `action_failed`）したaction数。`action_started` のみで完了していないactionはカウントされない |
| `uncommittedSessions` | `commitHash` が `null` のまま（=まだcommitに紐付いていない）session数 |
| `failedActionRate` | `action_failed` で終わったactionの割合。`totalActions` が0の場合は `null` |
| `totalRawEvents` | `eventType: "raw_event"` のイベント数（正規化できず生payloadのまま保持されたイベント） |
| `rawOnlyEventCount` | `normalizationStatus: "raw_only"` のイベント数（現状は `totalRawEvents` と一致するが、意味的に異なる指標として区別している） |
| `rawEventTruncatedCount` | `rawEventTruncated: true` のイベント数（`providers.copilot.rawEvent.maxBytes` を超えて切り詰められた件数） |

## トークン指標

| 指標 | 説明 |
| --- | --- |
| `inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `totalTokens` | 対象範囲内の合計トークン数。1件でも `tokenUsage` が観測できなかったactionを含む場合、集計方針に応じて `null` になることがある |
| `tokenSource` | `reported`（provider報告値そのまま）/ `estimated` / `unknown` のいずれか |

トークン数は「観測できなかった（`null`）」と「観測した結果ゼロだった」を区別します。これは各イベントの `sourceAvailability.tokenUsageAvailable` に基づきます。詳細は [event-schema.md](event-schema.md) を参照してください。

## Token効率指標（プロンプト改善のための主軸指標）

このパッケージが主な改善対象と位置付けるのは、プロンプトの質と、それに紐づくトークン効率です。

| 指標 | 説明 |
| --- | --- |
| `totalTokensPerSession` | 対象範囲内の総トークン数を、対象範囲内のsession数で割った値。プロンプトの効率性を見るための基本指標 |
| `totalTokensPerCommit` | 対象範囲内の総トークン数（未commitのsession分も含む）を、対象範囲内のdistinctなcommit数で割った値。「landedしたcommitに対してどれだけAIリソースを投じたか」を大まかに見る指標であり、「そのcommitに直接紐づくトークン数」ではない点に注意 |
| `inputTokensPerSession` | 1sessionあたりの平均inputトークン数。プロンプト自体の冗長さの傾向を見る |
| `outputTokensPerSession` | 1sessionあたりの平均outputトークン数 |
| `cacheRatePerSession` | 対象範囲内の `cacheReadTokens / (inputTokens + cacheReadTokens)`。プロンプトの再利用性・コンテキスト設計の効率を見る |
| `sessionsPerCommit` | 対象範囲内のsession数（未commitのsessionも含む）を、対象範囲内のdistinctなcommit数で割った値。少ないほど、少ない往復で目的の変更に到達できていることを示す |
| `actionsPerSession` | 1sessionあたりの平均action数 |

## Breakdown軸（provider/model/agent/skill別の見方）

`summary.json` は `overall` に加えて、以下の軸ごとに同じメトリクス（`MainMetrics`、上記のトークン指標・raw event指標をすべて含む）を持ちます。

| 軸 | フィールド名 | 用途 |
| --- | --- | --- |
| ユーザー別 | `byUser` | 開発者本人がどのユーザーになるかを軸に振り返る（`gitUserName` を保持） |
| 日付別 | `byDate` | 日ごとの利用傾向・トークン消費の変化を見る |
| provider別 | `byProvider` | `claude-code` / `copilot` / `unknown` 間の傾向の違いを見る（[provider-strategy.md](provider-strategy.md) の「無理に統一比較しない」方針に基づき、あくまで参考情報として扱う） |
| providerイベント名別 | `byProviderEventName` | providerが報告する元のイベント名（例: Claude Codeの `PreToolUse`、Copilotの独自イベント名）別の傾向を見る。`providerEventName` が無いイベントは `"unknown"` キーにまとめる |
| モデル別 | `byModel` | `modelRaw`（provider報告の生のモデル識別子）別の傾向を見る |
| commit別 | `byCommit` | どのcommitにどれだけのAIリソースが投じられたかを見る |
| agent別 | `byAgent` | 使用されたagent（`agent.name`）別の傾向を見る |
| skill別 | `bySkill` | 使用されたskill（`skill.name`）別の傾向を見る |
| 正規化状態別 | `byNormalizationStatus` | `normalized` / `partial` / `raw_only` / `failed` 別に件数・トークンなどを見る。正規化に失敗したイベントがどれだけあるかを把握するための軸 |

`byCommit` は `commitHash` が `null` のsessionを `"Uncommitted"` キーにまとめます。`byAgent` / `bySkill` は、agent/skillを使用しなかったsessionを `"none"` キーにまとめます。

いずれの軸も、対象イベントで値が観測できなかった場合は集計対象から除外され、該当メトリクスは `null` になります（推定して埋めることはしません）。

## prompt本文/response本文/rawEventの折りたたみ表示

`sessions.json` の各sessionは、そのsession内の全 `prompts`（`ReportPrompt`: `timestamp` + `promptBody`）、全 `actions`（`ReportAction`: 状態・agent/skill・トークン・`responseBody` など）、全 `rawEvents`（`ReportRawEvent`: `timestamp` / `toolProvider` / `providerEventName` / `normalizationStatus` / `rawEventTruncated` / `rawEvent`）をそのまま保持します。

- `promptBody` / `responseBody` は、`metrics.config.json` の `showPromptBody` / `showResponseBody` が `false` の場合は `null` になります（JSONLファイル自体は変更されず、レポートAPI/UI側でのみ非表示になります）
- `rawEvent` はこの設定の対象外で、常にそのまま返されます（保持有無・サイズ上限は `providers.copilot.rawEvent.enabled` / `maxBytes` で制御。詳細は [provider-strategy.md](provider-strategy.md)）
- `report serve` のUIでは、これらの本文・payloadはデフォルトで折りたたみ表示され（prompt/response本文は一覧では先頭200文字までのプレビュー）、必要なときだけ展開して確認する形になっています

## HTML reportで表示するビュー

`report serve` が提供するUIは以下のビューで構成されます。

| ビュー | 内容 |
| --- | --- |
| Overview | `overall` のメトリクスサマリー（raw event件数・切り詰め件数を含む） |
| Prompt View | session/action単位のプロンプト・応答本文の一覧（折りたたみ表示） |
| Commit View | commit別の集計（`byCommit`）、`Uncommitted` セッションの一覧 |
| Provider / Model View | provider別・モデル別の集計（`byProvider` / `byModel`、`claude-code` / `copilot` / `unknown` を固定表示） |
| Agent / Skill View | agent別・skill別の集計（`byAgent` / `bySkill`） |
| Raw Events View | `byProviderEventName` / `byNormalizationStatus`（`normalized` / `partial` / `raw_only` / `failed` を固定表示）の集計と、個々の `raw_event` の一覧（折りたたみ表示）。Copilotのraw eventにはexperimentalであることを示すバッジが付く |
