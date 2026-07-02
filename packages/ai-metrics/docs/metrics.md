# Metrics

このドキュメントは `ai-metrics report build` が生成する `summary.json` / `sessions.json` に含まれるメトリクスの一覧と定義です。イベントそのものの構造は [event-schema.md](event-schema.md) を参照してください。

## 集計の単位

- **session単位**: 1回のユーザー入力→AI応答のやり取り全体（`sessionId` で識別）
- **action単位**: session内の1回のAI応答/処理単位（`actionId` で識別、`action_started` / `action_completed` / `action_failed` の3イベントで構成される）
- **commit単位**: `gitContext.commitHash` によって、そのcommitに含まれた変更に対応するsessionをグルーピングしたもの。`commitHash` が `null` のsessionは `Uncommitted` として別枠で扱われる

## 基本カウント指標

| 指標 | 説明 |
| --- | --- |
| `totalSessions` | 対象範囲内のsession数 |
| `totalActions` | 対象範囲内で完了（`action_completed` または `action_failed`）したaction数。`action_started` のみで完了していないactionはカウントされない |
| `uncommittedSessions` | `commitHash` が `null` のまま（=まだcommitに紐付いていない）session数 |
| `failedActionRate` | `action_failed` で終わったactionの割合。`totalActions` が0の場合は `null` |

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

`summary.json` は `overall` に加えて、以下の軸ごとに同じメトリクス（`MainMetrics`）を持ちます。

| 軸 | フィールド名 | 用途 |
| --- | --- | --- |
| ユーザー別 | `byUser` | 開発者本人がどのユーザーになるかを軸に振り返る（`gitUserName` を保持） |
| 日付別 | `byDate` | 日ごとの利用傾向・トークン消費の変化を見る |
| provider別 | `byProvider` | Claude Code / Copilot など、provider間の傾向の違いを見る（[provider-strategy.md](provider-strategy.md) の「無理に統一比較しない」方針に基づき、あくまで参考情報として扱う） |
| モデル別 | `byModel` | `modelRaw`（provider報告の生のモデル識別子）別の傾向を見る |
| commit別 | `byCommit` | どのcommitにどれだけのAIリソースが投じられたかを見る |
| agent別 | `byAgent` | 使用されたagent（`agentInfo.name`）別の傾向を見る |
| skill別 | `bySkill` | 使用されたskill（`skillInfo.name`）別の傾向を見る |

`byCommit` は `commitHash` が `null` のsessionを `"Uncommitted"` キーにまとめます。`byAgent` / `bySkill` は、agent/skillを使用しなかったsessionを `"none"` キーにまとめます。

いずれの軸も、対象イベントで値が観測できなかった場合は集計対象から除外され、該当メトリクスは `null` になります（推定して埋めることはしません）。

## prompt本文/response本文の折りたたみ表示

`sessions.json` の各sessionは、そのsession内の全 `prompts`（`ReportPrompt`: `timestamp` + `promptBody`）と全 `actions`（`ReportAction`: 状態・agent/skill・トークン・`responseBody` など）をそのまま保持します。

- `promptBody` / `responseBody` は、`metrics.config.json` の `showPromptBody` / `showResponseBody` が `false` の場合は `null` になります（JSONLファイル自体は変更されず、レポートAPI/UI側でのみ非表示になります）
- `report serve` のUIでは、これらの本文はデフォルトで折りたたみ表示され、必要なときだけ展開して確認する形になっています

## HTML reportで表示するビュー

`report serve` が提供するUIは以下のビューで構成されます。

| ビュー | 内容 |
| --- | --- |
| Overview | `overall` のメトリクスサマリー |
| Prompt View | session/action単位のプロンプト・応答本文の一覧（折りたたみ表示） |
| Commit View | commit別の集計（`byCommit`）、`Uncommitted` セッションの一覧 |
| Provider-Model View | provider別・モデル別の集計（`byProvider` / `byModel`） |
| Agent-Skill View | agent別・skill別の集計（`byAgent` / `bySkill`） |
