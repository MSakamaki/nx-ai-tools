# Roadmap

このドキュメントは `@nx-ai-tools/ai-metrics` の現状の到達点（MVP）と、今後検討している方向性を整理したものです。ここに書かれていない項目は、現時点で計画されていません。

## MVP（現状で実現していること）

- Claude Codeからのイベント記録（`createClaudeCodeAdapter`、`ai-metrics init` によるhook自動設定）
- JSONLへのイベント記録（`recordEvent`、schemaVersion "1.0"）
- `ai-metrics report build` によるsummary/sessionsの集計生成
- `ai-metrics report serve` によるローカルHTMLレポート（Overview / Prompt View / Commit View / Provider-Model View / Agent-Skill View）
- `ai-metrics doctor` による読み取り専用の診断
- Copilotの experimental adapter interface（実データ取得手段は未提供）
- changesets + GitHub Releaseによるnpm publishフロー

## Next（比較的近い将来に検討する項目）

- **Copilot adapterの拡張**: 実際のテレメトリ取得手段（VS Code拡張やOpenTelemetry collectorとの連携など）が利用可能になった場合の統合。既存の `ProviderAdapter` 契約を維持したまま実データを供給する形を想定
- CLIコマンドの詳細リファレンスドキュメント（現状README/ソースのhelpに依存している部分の切り出し）

## Future（構想段階、着手時期未定）

- **promptFingerprint**: プロンプト本文から類似プロンプトを識別するための指標。プロンプトの「型」の再利用状況などを分析できるようにする構想
- **複数repo集約**: 複数リポジトリにまたがるai-metricsのデータを、チーム/組織単位で集約・比較する機能
- **セーフティパッケージ連携**: このパッケージ自体はセーフティ判定・ブロッキングを行わない方針を維持しつつ（[concept.md](concept.md) 参照）、別途のセーフティ判定パッケージとイベントデータを連携させる仕組み

## Non-goalsとの関係

上記のいずれの計画も、[concept.md](concept.md) に記載したNon-goals（個人監視目的での利用、セーフティ判定・ブロッキングの内包、AI活用の自動的な正しさ判定）を変更するものではありません。将来の拡張がこれらの原則と衝突する場合は、別パッケージとして切り出す方針を優先します。
