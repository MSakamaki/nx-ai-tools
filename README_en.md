# Nx Ai Tools

English | [日本語](./README.md)

## Releasing

Package versioning and npm publishing is managed with [Changesets](https://github.com/changesets/changesets).
`@nx-ai-tools/ai-metrics` is published as a public npm package.

1. **Create a changeset** for your change: `npx changeset` (or `npm run changeset`), pick the
   affected package(s) and bump type, and commit the generated file under `.changeset/` along with
   your PR.
2. **Merge to `main`.** The changeset file(s) land on `main` along with your change.
3. **Changesets opens a "Version Packages" PR.** The `Version Packages` workflow
   (`.github/workflows/version.yml`) runs on every push to `main`, bumps package versions,
   updates `CHANGELOG.md`, and consumes the pending changesets — all in one auto-maintained PR.
4. **Merge the "Version Packages" PR** once you're ready to release. This updates `main` with the
   new version number(s) and changelog(s), but does **not** publish to npm.
5. **Create a GitHub Release** for the new version (tag it e.g. `ai-metrics@x.y.z`, pointing at the
   commit from the merged Version Packages PR).
6. **Publishing to npm happens automatically** once that Release is published: the `Publish`
   workflow (`.github/workflows/publish.yml`) triggers on the `release.published` event, runs
   `nx affected` (lint/test/build/typecheck), packs and smoke-tests the `ai-metrics` CLI from the
   built tarball, then runs `npm publish --access public --provenance` for
   `@nx-ai-tools/ai-metrics`.

npm publishing only ever happens from the `Publish` workflow, never from CI or the versioning
workflow — publishing a GitHub Release is the explicit, human-triggered gate for shipping to npm.
If the version being released already exists on npm, the `npm publish` step fails as expected;
publish a new version instead.

### Required secret

The `Publish` workflow needs an **`NPM_TOKEN`** repository secret — an npm automation token with
publish rights to `@nx-ai-tools/ai-metrics` — set under Settings → Secrets and variables → Actions.
Without it, `npm publish` in that workflow will fail authentication.

