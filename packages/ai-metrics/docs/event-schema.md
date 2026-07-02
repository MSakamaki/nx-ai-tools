# Event Schema

`.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl` に記録される各行は、独立してパース可能な1つのJSONオブジェクトです。このドキュメントはそのスキーマ（`schemaVersion: "1.0"`）を定義します。

## schemaVersion "1.0"

現行のスキーマバージョンは `"1.0"` です。`recordEvent` / `recordEventAsync` が各イベントにこの値を付与します。将来、互換性のない変更を行う場合は `schemaVersion` を上げます。読み取り側は、未知のフィールドが追加される可能性を前提にする必要があります。

## Event type

| `eventType` | 説明 |
| --- | --- |
| `prompt_submitted` | ユーザーがAIにプロンプトを送信した時点で記録 |
| `action_started` | AIによる1回の処理（action）が開始した時点で記録 |
| `action_completed` | actionが成功して完了した時点で記録 |
| `action_failed` | actionが失敗またはキャンセルされた時点で記録 |
| `session_completed` | 1つのsession（ユーザー入力→AI応答の1往復）が完了した時点で記録 |

Sessionは「ユーザー入力→AI応答の1往復」、Actionは「AIからの1回の返答または処理単位」を指します。SessionとActionは `sessionId` / `actionId` によって親子関係を保持します（`actionId` はaction関連イベントのみ持つ）。

## 共通フィールド（`MetricsEventBase`）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `schemaVersion` | `"1.0"` | スキーマバージョン |
| `eventId` | `string` (UUID) | イベント固有のID |
| `eventType` | `MetricsEventType` | 上記のいずれか |
| `timestamp` | `string` (ISO 8601) | イベント発生時刻 |
| `sessionId` | `string` (UUID) | 親sessionのID |
| `actionId` | `string` (UUID, optional) | action関連イベントのみ保持 |
| `gitUserName` | `string` | `git user.name` の値 |
| `userSlug` | `string` | `gitUserName` から生成されるslug + short hash |
| `toolProvider` | `'claude-code' \| 'copilot' \| 'unknown'` | イベントの発生元provider |
| `modelRaw` | `string \| null` | provider報告の生のモデル識別子。取得不能時は `null` |
| `status` | `'success' \| 'error' \| 'cancelled' \| null` | 処理結果。取得不能時は `null` |
| `sourceAvailability` | `SourceAvailability` | 各フィールドが実際に観測できたかどうか |
| `gitContext` | `GitContext` | git関連情報 |
| `raw` | `unknown` | 正規化前のprovider生payload（デバッグ・再処理用） |

## TokenUsage

`action_completed` / `action_failed` / `session_completed` イベントが持つフィールド。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `inputTokens` | `number` | 入力トークン数 |
| `outputTokens` | `number` | 出力トークン数 |
| `cacheReadTokens` | `number` | キャッシュ読み取りトークン数 |
| `cacheWriteTokens` | `number` | キャッシュ書き込みトークン数 |
| `totalTokens` | `number` | 合計トークン数 |
| `tokenSource` | `'reported' \| 'estimated' \| 'unknown'` | トークン数の取得方法 |

`sourceAvailability.tokenUsageAvailable` が `false` の場合、このフィールド自体が意味を持たない（観測できなかった）ことを示します。集計時は「ゼロ」と「未観測」を区別してください。

## GitContext

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `repoRootHash` | `string` | リポジトリルートのハッシュ（識別用） |
| `branch` | `string` | イベント発生時のブランチ |
| `baseCommitHash` | `string` | session開始時点でworking treeが基づいていたcommit |
| `workingTreeId` | `string` | working tree識別子 |
| `commitHash` | `string \| null` | このイベントの変更が含まれたcommit。AI利用時点では常に `null`、commit作成後の後処理で付与される |
| `commitLinkStrategy` | `'since_previous_commit'` | commit紐付けの方針。前回commit後から今回commitまでの変更を対象とする |

`commitHash` が `null` のままのイベント・sessionは、レポート上 `Uncommitted` として表示されます。

## AgentInfo

`action_started` / `action_completed` / `action_failed` / `session_completed` イベントが持つフィールド。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `used` | `boolean` | agentが使用されたかどうか |
| `name` | `string \| null` | agent名 |
| `type` | `string \| null` | agentの種別 |
| `sourcePath` | `string \| null` | agent定義のソースパス |

## SkillInfo

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `used` | `boolean` | skillが使用されたかどうか |
| `name` | `string \| null` | skill名 |
| `sourcePath` | `string \| null` | skill定義のソースパス |

## SourceAvailability

「取得できなかった」ことと「取得した結果が空/ゼロだった」ことを区別するためのフィールド。すべてのイベントが持ちます。

| フィールド | 説明 |
| --- | --- |
| `tokenUsageAvailable` | トークン使用量が観測できたか |
| `modelAvailable` | `modelRaw` が観測できたか |
| `durationAvailable` | 処理時間が観測できたか |
| `promptAvailable` | プロンプト本文が観測できたか |
| `responseAvailable` | AI応答本文が観測できたか |

## イベント種別ごとの追加フィールド

| `eventType` | 追加フィールド |
| --- | --- |
| `prompt_submitted` | `promptBody: string \| null` |
| `action_started` | `actionId`（必須）, `agentInfo`, `skillInfo` |
| `action_completed` | `actionId`（必須）, `agentInfo`, `skillInfo`, `tokenUsage`, `responseBody: string \| null` |
| `action_failed` | `actionId`（必須）, `agentInfo`, `skillInfo`, `tokenUsage`, `responseBody: string \| null` |
| `session_completed` | `tokenUsage`, `agentInfo`, `skillInfo`, `responseBody: string \| null` |

## jsonlの保存パス

```
.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl
```

- `userSlug` は `git user.name` から生成される slug + short hash（ディレクトリ名として安全な形式にするため。人間が読める形式は各イベントの `gitUserName` を参照）
- 1ユーザー・1日につき1ファイル
- 各行が独立した1つのJSONオブジェクト（1行1イベント）

## 不正行の扱い

`ai-metrics report build` がイベントファイルを読み込む際、JSONとしてパースできない行、またはこのスキーマに一致しない行は、デフォルトでは**警告付きでskip**されます（該当ファイル・行番号を含む警告メッセージが出力され、ビルド自体は継続されます）。

CIなどで破損したイベントログを確実に検知したい場合は `--strict` オプションを使用してください。この場合、不正な行が1つでもあればビルド全体が失敗し（終了コード `1`）、出力ファイルは書き込まれません。

```sh
npx ai-metrics report build --strict
```
