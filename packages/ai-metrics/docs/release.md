# Release

## public npm packageとしての配布方針

- **package名**: `@nx-ai-tools/ai-metrics`
- **CLI名**: `ai-metrics`
- **Node.js**: `>=22`
- **公開範囲**: public npm package（`publishConfig.access: "public"`）
- **module形式**: ESM（`"type": "module"`）

## Versioning: changesetsでversion PRを作成

バージョニングは [Changesets](https://github.com/changesets/changesets) で管理します。

1. 変更に伴い、変更内容を説明するchangesetを追加して `main` にマージする
2. `main` へのpushをトリガーに `Version Packages` ワークフロー（`.github/workflows/version.yml`）が動作し、未処理のchangesetがあれば "Version Packages" PR を自動的に作成・更新する（`package.json` のバージョン更新、`CHANGELOG.md` の更新）
   - このワークフロー自体はnpm publishを行いません
3. "Version Packages" PR をレビューし、`main` にマージする

## Publishing: GitHub Release publishedでnpm publish

npm publishは、`main` へのマージで自動的には行われません。**GitHub Releaseの作成（`release.published` イベント）が唯一のpublishトリガーです。**

1. "Version Packages" PR がマージされた後、メンテナが該当バージョンの **GitHub Release** を手動で作成する
2. `release.published` イベントが `Publish` ワークフロー（`.github/workflows/publish.yml`）を起動する
3. `Publish` ワークフローが以下を実行する:
   - `npx nx run-many -t lint test build typecheck -p ai-metrics`
   - `npm pack --dry-run`（`packages/ai-metrics` 内）
   - `npx nx build ai-metrics`
   - パッケージをtarball化し、素の一時プロジェクトへ `npm install` した上でCLIのスモークテスト（`ai-metrics --help` が `Usage: ai-metrics` を出力することを確認）
   - `npm publish --access public --provenance`（`NPM_TOKEN` を使用）

## NPM_TOKENが必要

`Publish` ワークフローは、リポジトリのSecretsに `NPM_TOKEN` が設定されている必要があります（`env.NODE_AUTH_TOKEN` として渡される）。また、npm provenance発行のために `id-token: write` permissionが必要です。

すでに同じバージョンがnpmに公開済みの場合、`npm publish` は自然に失敗します（既存バージョンの上書きを防ぐガード自体は設けていません — 失敗そのものが安全側の挙動です）。

## CIで確認する内容

`CI` ワークフロー（`.github/workflows/ci.yml`）は `main` へのpush / pull requestで動作し、以下を確認します。

- `npx nx affected -t lint test build typecheck` — 変更の影響を受けるプロジェクトに対して lint / test / build / typecheck を実行
- `npm pack --dry-run`（`packages/ai-metrics` 内）
- `npx nx build ai-metrics`
- ビルドされたCLIエントリを直接実行するスモークテスト（`node packages/ai-metrics/dist/cli/index.js --help`）
- tarball化 → 一時プロジェクトへの `npm install` → `npx ai-metrics --help` によるスモークテスト（依存関係が実際にpublish形態で解決できることの確認）

`Publish` ワークフロー側も、releaseイベントには自然なaffected baseが存在しないため、`nx affected` ではなく `-p ai-metrics` で対象を明示して同様の検証を行っています。

## SemVer

このパッケージはSemVerに従います。

- **stable API**（`recordEvent` / `loadConfig` / `createClaudeCodeAdapter` / `buildReport` など、`@nx-ai-tools/ai-metrics` のトップレベルexportsから提供されるもの）に対する破壊的変更はメジャーバージョンアップを伴います
- **experimental API**（`@nx-ai-tools/ai-metrics/experimental` から提供されるもの、例: `createCopilotAdapter` / `recordEventAsync` / `buildReportAsync`）は、SemVerの通常の保証の対象外です。マイナー・パッチバージョンでも変更・削除される可能性があります
- イベントスキーマの `schemaVersion`（現在 `"1.0"`）は、パッケージのSemVerとは独立してバージョニングされます。イベントの形が互換性のない形で変わる場合に上げられます

## exportsの安定APIとexperimental APIの扱い

`package.json` の `exports` フィールドは次のように分離されています。

```json
{
  "exports": {
    ".": { "...": "stable API" },
    "./experimental": { "...": "experimental API" },
    "./schema/metrics.config.schema.json": "./dist/schema/metrics.config.schema.json"
  }
}
```

利用者は、安定性の保証を必要とする用途では `.` からのみimportすることを推奨します。`./experimental` を利用する場合は、将来のマイナー・パッチバージョンで変更される可能性を許容した上で利用してください。
