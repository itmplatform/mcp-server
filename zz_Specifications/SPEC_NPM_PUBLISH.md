# NPM Publishing: @itm-platform/mcp-server

## Goal

Publish `@itm-platform/mcp-server` to npmjs.com under the `itm-platform` org so end users can run `npx @itm-platform/mcp-server`.

## Current state of npm tokens (verified May 2026)

- **Classic tokens were permanently revoked** on December 9, 2025.
- **Granular access tokens** are the only token type. Write tokens are capped at **90 days max** and require 2FA by default (a "Bypass 2FA" checkbox exists for CI/CD).
- There is no "Automation" token type anymore. That was a classic-token feature, now gone.

Source: [npm security update -- classic token creation disabled](https://github.blog/changelog/2025-11-05-npm-security-update-classic-token-creation-disabled-and-granular-token-changes/) and [classic tokens revoked Dec 9](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/).

## Recommended approach: Trusted Publishing (OIDC via GitHub Actions)

npm supports **trusted publishing** since July 2025 (GA). It uses OpenID Connect so GitHub Actions proves its identity to npm directly. No token is created, stored, or rotated. Ever.

Source: [npm trusted publishing GA announcement](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/), [npm docs -- trusted publishers](https://docs.npmjs.com/trusted-publishers/).

### Cost: free

Everything needed is available on GitHub Free:

| Feature | Free plan? | Notes |
|---|---|---|
| GitHub Actions | Yes | Unlimited minutes for **public repos**. 2,000 min/month for private repos |
| OIDC `id-token: write` | Yes | Available on all GitHub plans (Free, Pro, Team, Enterprise) |
| npm trusted publishing | Yes | npm feature, no cost on any plan |
| Provenance attestations | Yes | Automatic, but only for **public** source repos |

Source: [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage), [GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans).

**Public vs. private repo matters:**
- **Public repo**: unlimited Actions minutes, provenance badges on npmjs.com.
- **Private repo**: trusted publishing still works (the package can be public on npm), but provenance attestations are NOT generated, and you get 2,000 Actions minutes/month.

Since `@itm-platform/mcp-server` is a public npm package meant for end users, making the GitHub repo public is the natural choice. It also gives you unlimited CI minutes and provenance.

### Why this is the right choice

| Approach | Token rotation? | 2FA bypass needed? | Works with org scopes? |
|---|---|---|---|
| Granular token (90-day) | Every 90 days, manually | Yes | Yes |
| Trusted publishing (OIDC) | Never -- no token | No | Yes |

### Requirements

- **npm CLI >= 11.5.1** (ships with Node >= 22.14.0)
- **GitHub-hosted runners only** (self-hosted runners are not supported for OIDC)
- `id-token: write` permission on the GitHub Actions job

Source: [npm docs -- trusted publishers](https://docs.npmjs.com/trusted-publishers/), [Phil Nash -- things you need for trusted publishing](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/).

## GitHub repo

- **Org**: `itmplatform` (https://github.com/itmplatform)
- **Current public repos**: only `extension-docs`
- **New repo needed**: `itmplatform/mcp-server` (or `itmplatform/ITM.MCP` -- decide)

The `gh` CLI is not installed on this machine. Install it or create the repo from the GitHub web UI.

## Setup steps

### 1. Create the GitHub repo

Create a public repo under https://github.com/itmplatform. The repo name goes into `package.json`'s `repository.url` and the npm trusted publisher config -- they must match exactly.

### 2. Update package.json

The `name` must become the scoped org name, and a `repository` field must match the GitHub repo exactly:

```json
{
  "name": "@itm-platform/mcp-server",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/itmplatform/mcp-server.git"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

> The `repository.url` must match the GitHub repo exactly. All fields in the trusted publisher config are case-sensitive.

### 3. Add `files` to package.json

Only ship what end users need:

```json
{
  "files": ["dist", "bin", "README.md", "LICENSE"]
}
```

This excludes tests, Pipelines, .env files, zz_Specifications, APIDocs, etc. from the npm tarball.

### 4. First publish (one-time, needs a 90-day token)

Trusted publishing can only be configured on an **existing** package. The first publish must use a granular token:

1. Create a granular token at npmjs.com: write access, 90-day expiry, "Bypass 2FA" checked, scoped to `@itm-platform`
2. Locally: `npm publish --access public` using that token
3. After the package exists on npm, configure trusted publishing (step 5) and discard the token

### 5. Configure trusted publisher on npmjs.com

Go to the package page > Access tab (`https://www.npmjs.com/package/@itm-platform/mcp-server/access`):

- **Organization or user**: `itmplatform`
- **Repository**: the repo name (e.g., `mcp-server`)
- **Workflow filename**: `npm-publish.yml`
- **Environment**: (optional, but recommended -- e.g., `npm-publish`)
- **Allowed actions**: select `npm publish` (required for configs created after May 20, 2026)

> **Gotcha**: this is per-package, not org-wide. Each package needs its own trusted publisher config.

### 6. Create the GitHub Actions workflow

```yaml
# .github/workflows/npm-publish.yml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write    # OIDC token for npm trusted publishing
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish --provenance --access public
```

**Key points:**

- `id-token: write` is mandatory for OIDC to work.
- `--provenance` is recommended explicitly even though trusted publishing should add it automatically ([some users report needing it](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)).
- `--access public` is required on the first publish of a scoped package.
- Do NOT set `NODE_AUTH_TOKEN` -- that would override OIDC with a token-based flow.
- Do NOT enable npm caching (`package-manager-cache: false` or just omit it) on publish workflows.

### 7. Trigger: GitHub Releases

The workflow triggers on `release published`. The flow is:

1. Bump version in `package.json` (manually or via a script)
2. Push to main/GitHub
3. Create a GitHub Release / tag (e.g., `v1.0.0`)
4. GitHub Actions runs, publishes to npm with provenance

## What stays in Azure DevOps

The existing Azure DevOps pipelines continue to handle deployment to stage/prod VMs via PM2. npm publishing is orthogonal -- it ships the package for end-user `npx` consumption, not for your server deployments.

| Concern | Where |
|---|---|
| Build, test, deploy to stage/prod VMs | Azure DevOps (unchanged) |
| Publish `@itm-platform/mcp-server` to npm | GitHub Actions (new) |

## Dual-remote Git setup

The repo will have two remotes:

- **Azure DevOps** (`origin`): triggers stage/prod deployment pipelines
- **GitHub** (`github`): triggers npm publish on release

You can push to both, or mirror automatically. The simplest approach is adding a second remote:

```bash
git remote add github https://github.com/itmplatform/mcp-server.git
git push github main
```

## Fallback: 90-day granular token (Azure DevOps only)

If GitHub is not set up yet, the temporary alternative is:

1. Create a granular token at npmjs.com with write access, 90-day expiry, "Bypass 2FA" checked, scoped to `@itm-platform/mcp-server`
2. Store it as a secret in **Azure Key Vault** (like all other secrets), and link it as a pipeline variable
3. Add a pipeline step:

```yaml
- script: |
    echo //registry.npmjs.org/:_authToken=$(NPM_TOKEN) > .npmrc
    npm publish --access public
  displayName: 'NPM Publish'
  env:
    NPM_TOKEN: $(NPM_TOKEN)
```

4. Set a calendar reminder to rotate the token before it expires (every 90 days)

This is a stopgap. Migrate to trusted publishing as soon as the repo is on GitHub.

## Open questions

- [ ] Repo name on GitHub: `mcp-server` or `ITM.MCP`?
- [ ] Public or private repo? (public recommended -- free unlimited Actions minutes + provenance)
- [ ] Decide what to include in the npm tarball (`files` field in package.json)
- [ ] Decide whether to use GitHub Releases (manual) or automated version bumps (e.g., changesets, semantic-release)
- [ ] Install `gh` CLI for easier GitHub management, or manage from the web UI
