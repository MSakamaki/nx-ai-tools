# @nx-ai-tools/ai-metrics ドキュメント目次

このディレクトリは [README.md](../README.md) では扱わない詳細情報をまとめています。目的別に読むべきドキュメントを選んでください。

## 読者別ガイド

| あなたは... | まず読むべきドキュメント |
| --- | --- |
| 導入するかどうか判断したい | [privacy-and-data-policy.md](privacy-and-data-policy.md) → [provider-strategy.md](provider-strategy.md) |
| 記録される値・集計指標の意味を知りたい | [event-schema.md](event-schema.md) → [metrics.md](metrics.md) |
| このツールの目的・思想を理解したい | [concept.md](concept.md) |
| 内部実装を理解・拡張したい | [architecture.md](architecture.md) → [provider-strategy.md](provider-strategy.md) |
| リリース・publish手順を知りたい | [release.md](release.md) |
| 今後の方向性を知りたい | [roadmap.md](roadmap.md) |
| 実装変更に伴いどのdocsを更新すべきか知りたい（AI Agent含む） | [contributing-docs.md](contributing-docs.md) |

## ドキュメント一覧

| ファイル | 内容 |
| --- | --- |
| [concept.md](concept.md) | このパッケージが存在する理由、設計原則、Non-goals |
| [architecture.md](architecture.md) | package内部構造（core/cli/providers/report-uiの責務分担） |
| [event-schema.md](event-schema.md) | JSONLイベントのスキーマ定義（schemaVersion "1.0"） |
| [metrics.md](metrics.md) | 取得・集計するメトリクスの一覧と定義 |
| [provider-strategy.md](provider-strategy.md) | Claude Code / Copilotの対応方針、共通指標とprovider固有指標の分離方針 |
| [privacy-and-data-policy.md](privacy-and-data-policy.md) | 保存されるデータ、保存されないデータ、git方針、チーム導入時の注意 |
| [release.md](release.md) | npm publishフロー、SemVer、CI要件 |
| [roadmap.md](roadmap.md) | MVP / Next / Future の分類 |
| [contributing-docs.md](contributing-docs.md) | 実装変更の種類ごとに、どのドキュメントを更新すべきかのルール |

## 補足

- 各ドキュメントは日本語で記述していますが、package名・CLI名・API名・`eventType`・設定キーなどの識別子は英語のまま表記しています。
- 現時点では英語版ドキュメントは提供していません。
