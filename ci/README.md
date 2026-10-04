# Release dependencies

`dependencies.json` pins the upstream source commits used by `.github/workflows/build.yml`:

- [mini-lit v0.2.1](https://github.com/badlogic/mini-lit/tree/dee21bf1175de0cb16a946ba8fb62c1e590fbd3c)
- [pi-mono v0.58.3](https://github.com/badlogic/pi-mono/tree/1c93f9f0991ba7d737b60920a3219b482e7d6bc6)

The `patches/pi-mono-sitegeist.patch` file is the combined, reviewed diff of the local Pi commits `adf6f57` (model thinking metadata, selector/dialog hooks, default-model fallback) and `db30b78` (explicit `none` reasoning effort). It includes their upstream changelog entries and no generated model data. Pi's upstream MIT license remains in the cloned dependency repository.

CI checks the base commit, clean checkout, patch SHA-256, resulting Git tree and original bundled model catalog blob. A patch that no longer applies or produces different dependency sources fails before building. It is deliberately applied only to fresh CI checkouts, never to developers' existing sibling repositories. No Pi fork or unpublished remote commit is required.

The extension source and its manifest/changelog always come from the selected release tag. For a normal tag push, release tooling comes from that same tag. For a manual repair, tooling comes from the chosen workflow branch (normally `main`), while extension source stays at the existing tag. Both source and tooling commit IDs, dependency pins and patch checksums are included in the ZIP's `build-info.json`.

## Rebuild an existing tag

After the repaired workflow has been committed and pushed to `main`:

1. Open GitHub **Actions > Release Extension**.
2. Choose **Run workflow**, select branch `main`, and enter `v1.1.0` as `release_tag`.
3. Wait for both the build/test job and publish job to succeed.

Alternatively, from an authenticated GitHub CLI:

```bash
gh workflow run build.yml --ref main -f release_tag=v1.1.0
```

Re-running the old failed tag job alone uses its old workflow, not this repair. Do not move or force-push an existing release tag. A successful manual repair creates the GitHub release if missing or replaces `sitegeist.zip` on its existing release. Important: replacing the asset is intentional; already downloaded copies are not updated automatically.

The workflow uses `build-all.sh --install`: platform-native installs, only the required Pi packages, `tsc` for Lit web-ui, no model regeneration, no full Pi monorepo build. It type-checks and tests the tagged extension before publishing. Build has read-only repository permissions; only the isolated publish job receives release-write permission. If workflows are disabled in a fork, enable them in the repository's Actions settings first.

## Updating dependency pins

When changing a base commit or patch, update the commit IDs, patch SHA-256, reviewed resulting tree and bundled catalog blob together. Keep the generated catalog out of the patch. Verify the patch on clean clones and run `test/ci-release.test.mjs`, extension checks and regression tests before committing. Changes to the actual Pi implementation should still be made and tested in the sibling Pi repository, then exported as a reviewed patch.
