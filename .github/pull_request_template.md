<!--
AI Agentがこのリポジトリに対してPRを作成する場合も、このテンプレートに従って記入してください。
`packages/ai-metrics` に対する変更については、docs更新の判断基準を
packages/ai-metrics/docs/contributing-docs.md に定義しています。記入前に確認してください。
-->

## 変更概要

<!-- 何を、なぜ変更したのかを簡潔に記載する -->

## 影響範囲

<!-- 影響を受けるパッケージ・機能を記載する（例: packages/ai-metrics の CLI / report生成 / provider adapter など） -->

## 変更チェックリスト（該当するものにチェック）

- [ ] Public API変更あり（`recordEvent` / `loadConfig` / `createClaudeCodeAdapter` / `buildReport` など、`src/index.ts` からのexport）
- [ ] Experimental API変更あり（`createCopilotAdapter` / `recordEventAsync` / `buildReportAsync` など、`src/experimental.ts` からのexport）
- [ ] jsonl schema変更あり（`MetricsEvent` の型、`schemaVersion` など）
- [ ] 保存データ変更あり（新しく記録・保存されるようになったフィールド、保存先パス、`.gitignore` の扱いなど）
- [ ] provider対応変更あり（Claude Code / Copilotのadapter実装、対応状況ステータスの変更、新規provider追加）
- [ ] CLIコマンド変更あり（`init` / `doctor` / `report build` / `report serve` のオプション・出力・終了コード）
- [ ] release workflow変更あり（`.github/workflows/*.yml`、`package.json` の `exports` / `engines` / `publishConfig`）
- [ ] 上記のいずれにも該当しない（内部リファクタリング・テストのみなど）

いずれかにチェックした場合、`packages/ai-metrics/docs/contributing-docs.md` の該当項目に従ってドキュメントを更新してください。

## docs更新の有無

<!-- 更新したドキュメントファイルを列挙する。更新不要と判断した場合はその理由も記載する -->

- [ ] README.md
- [ ] docs/concept.md
- [ ] docs/architecture.md
- [ ] docs/event-schema.md
- [ ] docs/metrics.md
- [ ] docs/provider-strategy.md
- [ ] docs/privacy-and-data-policy.md
- [ ] docs/release.md
- [ ] docs/roadmap.md
- [ ] 更新不要（理由: ）

## テスト実行結果

<!-- 実行したコマンドと結果を記載する（例: nx affected -t lint test build typecheck の結果） -->

```
$
```
