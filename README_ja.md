# Nx Ai Tools

[English](./README.md) | 日本語

## リリース手順

パッケージのバージョン管理とnpm publishは [Changesets](https://github.com/changesets/changesets) で管理しています。
`@nx-ai-tools/ai-metrics` はpublicなnpm packageとして公開されます。

1. **changesetを作成する**: `npx changeset`(または `npm run changeset`)を実行し、対象パッケージと
   バージョンの種類を選択、生成されたファイルを `.changeset/` 配下にPRと一緒にコミットします。
2. **mainへmergeする。** changesetファイルは変更内容と共に `main` に取り込まれます。
3. **Changesetsが "Version Packages" PRを作成する。** `Version Packages` workflow
   (`.github/workflows/version.yml`) が `main` へのpushのたびに実行され、パッケージのバージョンを
   上げ、`CHANGELOG.md` を更新し、未反映のchangesetを1つのPRにまとめます(このPRは自動的に
   最新の状態に更新され続けます)。
4. リリースする準備ができたら **"Version Packages" PRをmergeします。** これにより `main` に新しい
   バージョン番号とchangelogが反映されますが、npmへのpublishは **行われません**。
5. 新しいバージョンに対して **GitHub Releaseを作成します**(例: `ai-metrics@x.y.z` のようなタグを、
   マージ済みのVersion Packages PRのコミットに対して付与)。
6. そのReleaseがpublishされると、**npmへの公開が自動的に行われます**: `Publish` workflow
   (`.github/workflows/publish.yml`) が `release.published` イベントをトリガーに起動し、
   `nx affected`(lint/test/build/typecheck)を実行し、ビルド済みtarballから `ai-metrics` CLIの
   pack・smoke testを行った上で、`@nx-ai-tools/ai-metrics` に対して
   `npm publish --access public --provenance` を実行します。

npmへのpublishは常に `Publish` workflowからのみ行われ、CIやバージョニングのworkflowからは
行われません — GitHub Releaseの作成が、npmへ公開するための明示的かつ人手によるゲートです。
公開しようとしているバージョンが既にnpmに存在する場合、`npm publish` は想定通り失敗します。
その場合は新しいバージョンを公開し直してください。

### 必要なsecret

`Publish` workflowには **`NPM_TOKEN`** リポジトリsecretが必要です — `@nx-ai-tools/ai-metrics` への
publish権限を持つnpm automation tokenを、Settings → Secrets and variables → Actions配下に登録して
ください。設定されていない場合、そのworkflow内の `npm publish` は認証エラーで失敗します。
