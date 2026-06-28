# Releasing

Hermes UI ships from a single version tag. Pushing `vX.Y.Z` fans out to every
channel — GitHub Release, npm, desktop installers, Docker image, and the UI
runtime tarball. This document is the maintainer runbook; the workflow structure
is described in [`../ARCHITECTURE.md`](../ARCHITECTURE.md#release-flow).

## Prerequisites (one-time)

Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `NPM_TOKEN` | yes | `npm-publish.yml` | Automation token for the `@pythoughts` npm org. |
| `DOCKERHUB_USERNAME` | yes | `docker-publish.yml` | Docker Hub namespace. The published docs assume this is `pythoughtslabs`, so the image is `pythoughtslabs/hermes-ui`; set it to match or the image path changes. |
| `DOCKERHUB_TOKEN` | yes | `docker-publish.yml` | Docker Hub access token. |
| `MAC_CSC_LINK` | optional | `desktop-release.yml` | Base64 `.p12` signing cert. Without it, macOS builds are unsigned. |
| `MAC_CSC_KEY_PASSWORD` | optional | `desktop-release.yml` | Password for the signing cert. |
| `APPLE_ID` | optional | `desktop-release.yml` | Apple ID for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | optional | `desktop-release.yml` | App-specific password for notarization. |
| `APPLE_TEAM_ID` | optional | `desktop-release.yml` | Apple Developer team ID. |

`GITHUB_TOKEN` is provided automatically — no setup needed.

## Cut a release

1. Bump the version in both manifests, kept equal:
   - `package.json`
   - `packages/desktop/package.json`
2. Sync the lockfile: `npm install` (updates `package-lock.json`).
3. Optionally add a changelog entry in
   `packages/client/src/data/changelog.ts` and its i18n string in
   `packages/client/src/i18n/locales/en.ts`.
4. Validate locally: `npm run build` and `npm run test`.
5. Commit the bump.
6. Tag and push:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

The tag push triggers everything. No GitHub Release needs to be created by hand.

## What fires, and in what order

Pushing the tag runs each channel exactly once, in parallel:

- `release.yml` creates the GitHub Release (notes auto-generated, **non-latest**).
- `npm-publish.yml` publishes to npm — idempotent: it skips a version already on
  the registry, so re-running a tag is safe.
- `desktop-release.yml` builds macOS / Windows / Linux installers.
- `docker-publish.yml` pushes the multi-arch image.
- `ui-release.yml` packages the runtime tarball.

The Release stays non-latest until the desktop flow has uploaded every installer
and the merged macOS updater manifest; the desktop workflow then promotes the
Release to latest. That ordering is intentional — clients should not see a
release as "latest" before its installers exist.

> [!NOTE]
> Each channel triggers off the `push: tags` event, not off the Release that
> `release.yml` creates. A Release created by the built-in `GITHUB_TOKEN` does
> not re-trigger other workflows, so there is no double run. The npm, Docker, and
> UI-artifact channels also carry a `release: published` trigger as a fallback
> for a Release created by hand in the GitHub UI; desktop packaging is
> tag-and-dispatch only.

## Re-running a single channel

If one channel fails, re-run just that workflow from the **Actions** tab via its
`workflow_dispatch` input (pass the existing tag, e.g. `v0.1.1`). For a single
desktop target, use `desktop-manual-build.yml`. npm publish is idempotent, so a
re-run after a partial failure will not error on an already-published version.
