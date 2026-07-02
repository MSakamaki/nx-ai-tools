# Roadmap

このドキュメントは `@nx-ai-tools/ai-metrics` の現状の到達点（MVP）と、今後検討している方向性を整理したものです。ここに書かれていない項目は、現時点で計画されていません。

## MVP（現状で実現していること）

- Claude Codeからのイベント記録（`createClaudeCodeAdapter`、`ai-metrics init --provider claude-code` によるhook自動設定）
- Copilotの experimental / project hooks template（`.github/hooks/ai-metrics.json` + `copilot-hook.mjs`、`createCopilotHookAdapter`、イベント名マッピングは `adapter.config.json` で設定可能。未知イベントは `raw_event` として保持）
- `ai-metrics init` のprovider選択（`--provider`、省略時はTTYで対話式チェックボックス・非TTYでは `claude-code` のみ）
- JSONLへのイベント記録（`recordEvent`、schemaVersion "1.0"）、`rawEvent` のサイズ上限・切り詰め（`providers.copilot.rawEvent.maxBytes`）
- `ai-metrics report build` によるsummary/sessionsの集計生成（provider/providerEventName/model/commit/agent/skill/normalizationStatus別のbreakdown、raw event件数を含む）
- `ai-metrics report serve` によるローカルHTMLレポート（Overview / Prompt View / Commit View / Provider / Model View / Agent / Skill View / Raw Events View）
- `ai-metrics doctor` による読み取り専用の診断（`--provider` によるprovider別診断、Copilot明示指定時の必須ファイルチェック）
- changesets + GitHub Releaseによるnpm publishフロー

## Next（比較的近い将来に検討する項目）

- **Copilotの実データ取得手段の拡充**: 現状は「project hooks template」としてユーザー自身がイベント源を配線する前提。VS Code拡張やOpenTelemetry collectorなど、より自動化された取得手段が実現した場合の統合を検討する。既存の `ProviderAdapter` 契約・`adapter.config.json` の設定インターフェースを維持したまま拡張する想定
- CLIコマンドの詳細リファレンスドキュメント（現状README/ソースのhelpに依存している部分の切り出し）

## Future（構想段階、着手時期未定）

- **promptFingerprint**: プロンプト本文から類似プロンプトを識別するための指標。プロンプトの「型」の再利用状況などを分析できるようにする構想
- **複数repo集約**: 複数リポジトリにまたがるai-metricsのデータを、チーム/組織単位で集約・比較する機能
- **セーフティパッケージ連携**: このパッケージ自体はセーフティ判定・ブロッキングを行わない方針を維持しつつ（[concept.md](concept.md) 参照）、別途のセーフティ判定パッケージとイベントデータを連携させる仕組み

## Non-goalsとの関係

上記のいずれの計画も、[concept.md](concept.md) に記載したNon-goals（個人監視目的での利用、セーフティ判定・ブロッキングの内包、AI活用の自動的な正しさ判定）を変更するものではありません。将来の拡張がこれらの原則と衝突する場合は、別パッケージとして切り出す方針を優先します。
