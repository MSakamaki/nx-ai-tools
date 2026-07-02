# Provider Strategy

## Claude Code: initial support

Claude Codeは、現時点でこのパッケージが実際に動作する唯一のproviderです。

- `createClaudeCodeAdapter`（`@nx-ai-tools/ai-metrics`）を通じて、Claude Codeのhook（`UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Stop` / `SessionEnd`）から渡される入力をai-metricsのイベントに正規化します
- `ai-metrics init` が `.ai/metrics/hooks/claude-code-hook.mjs` を配置し、`.claude/settings.json` にhook設定を追加します
- hookの記録処理は同期的に行われ、記録処理自体が失敗してもClaude Codeの動作をブロックしません（エラーはstderrに出力され、hookプロセスは常に終了コード0を返します）

「initial support」という位置付けは、Claude Codeとの連携が実際に動作し、日常的に使える状態にあることを意味しますが、Claude Code側のhook仕様変更などに追従が必要な、発展途中の実装であることも意味します。

## Copilot: experimental / project hooks template

Copilotには、Claude Codeのhooksに相当する標準機構が存在しません。そのため、ai-metricsは「project hooks template」という形で、プロジェクト側が自分のCopilotイベント源（VS Code拡張・カスタムスクリプト・CIジョブなど）を配線するための足場一式を提供します。

- `ai-metrics init --provider copilot` が以下を生成します
  - **`.github/hooks/ai-metrics.json`**: Copilot側が直接読む想定のhook設定。ファイル名は固定で、git管理対象です。`version` と `hooks`（イベント名 → `{ command, env }`）のみを持ち、ai-metrics独自の設定は一切含みません
  - **`.ai/metrics/hooks/copilot-hook.mjs`**: 実際に呼ばれる薄いラッパー。`AI_METRICS_HOOK_EVENT` 環境変数からCopilotネイティブのイベント名を受け取り、`.ai/metrics/copilot/adapter.config.json` の `eventTypeMap` でai-metrics内部のイベント種別に変換した上で、`node_modules/@nx-ai-tools/ai-metrics/dist/providers/copilot/hook-entry.js` を子プロセスとして起動します。インストール未了・repo root未検出・その他のエラーはすべてWARNとしてstderrに出力し、必ず終了コード0で終わります
  - **`.ai/metrics/copilot/adapter.config.json`**: ai-metrics独自設定（`eventTypeMap` など）。`.github/hooks/ai-metrics.json` とは意図的に分離しています
  - **`.ai/metrics/copilot/{README.md,sample-event.json}`**: 使い方の説明とペイロードのサンプル
- `createCopilotHookAdapter` / `normalizeCopilotEvent` / `runCopilotHookEntry` は `@nx-ai-tools/ai-metrics/experimental` からのみ提供されます
- 初期に想定しているCopilotネイティブのイベント名: `userPromptSubmitted` / `agentStop` / `sessionEnd` / `errorOccurred`（必要に応じて `preToolUse` / `postToolUse`）。`adapter.config.json` の `eventTypeMap` で対応関係を変更できます
- **イベント種別が分かる場合だけ正規化し、未知のイベントは `raw_event` として生のpayloadのまま記録します**（破棄しません）。`normalizationStatus: "raw_only"` で識別できます
- `providers.copilot.enabled`（`metrics.config.json`）を `false` にすると、Copilotイベントの記録自体を止められます。`providers.copilot.rawEvent.enabled` / `maxBytes` で `rawEvent` の保持有無・最大サイズ（デフォルト1MB、超過分は切り詰め `rawEventTruncated: true`）を制御できます
- Copilotのイベントは、実際に取得できなかったフィールドについて `sourceAvailability` が該当項目を `false` として報告します

**Copilot対応はexperimentalです。** VS Code Chatの完全な計測は保証されません — prompt/response本文・トークン使用量・モデル名などが取得できるかどうかは、完全にユーザーが用意するCopilotイベント源の実行環境に依存します。安定版APIとしての互換性保証はなく、将来のマイナーバージョンで変更・削除される可能性があります。詳細は `ai-metrics init --provider copilot` が生成する `.ai/metrics/copilot/README.md` も参照してください。

## 共通指標とprovider固有指標を分ける方針

Claude CodeとCopilotでは、そもそも取得できる情報の粒度・種類が異なります。このパッケージは、両者を無理に同じ粒度に押し込めて比較可能にすることを目指しません。代わりに次のように扱います。

- **共通指標**: `MetricsEventBase` に含まれるフィールド（`eventType` / `timestamp` / `git` / `tokenUsage` など）は、どのproviderでも同じ意味を持つように定義されています。`summary.json` の `byProvider` は、この共通指標をprovider間で並べて見るためのものです
- **provider固有指標**: `rawEvent` フィールドには正規化前の生payloadがそのまま保持されます。provider固有の詳細情報が必要な場合はここを参照します。将来的にprovider固有の集計軸が必要になった場合も、共通の `MainMetrics` を汚さない形で追加する方針です

`byProvider` の比較はあくまで参考情報であり、「Claude CodeとCopilotのどちらが優れているか」を判定するものではありません。両者の取得可能な情報の粒度が異なる以上、単純な優劣比較には適していません。

## 取得できない値はnullにする方針

すべてのproviderに共通する原則として、実際に観測できなかった値は推定して埋めることをせず `null` として保持します（`modelRaw` / `status` / `promptBody` / `responseBody` / `commitHash` など）。これは [concept.md](concept.md) の設計原則の一つです。

## sourceAvailabilityの考え方

`sourceAvailability` は、各イベントについて「そのフィールドを実際に観測できたか」を示す真偽値の集合です（`tokenUsageAvailable` / `modelAvailable` / `durationAvailable` / `promptAvailable` / `responseAvailable`）。

これが必要な理由は、「トークン数が0」と「トークン数を観測できなかった」を区別する必要があるためです。例えばCopilot adapterが実データを持たないフィールドについては、値をゼロや空文字で埋めるのではなく、`sourceAvailability` の該当項目を `false` にした上で値自体は `null` にします。集計処理（`report/aggregate.ts`）はこの区別に基づいて、observedでない値を集計対象から除外します。

新しいproviderを追加する場合も、実際に取得できた情報だけを `true` として報告し、取得できなかった情報を推定して埋めないことが、このパッケージのデータに対する信頼性を保つ前提になります。
