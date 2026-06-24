# MCP Registry Submissions -- Tracking & Playbook

> **Goal:** List the ITM Platform MCP server in every major MCP directory for SEO and discoverability.
>
> **Date:** 2026-06-12

---

## 1. Prerequisites (shared across registries)

Before submitting anywhere, these gaps must be closed. Items marked **[Claude]** can be automated; items marked **[Manual]** need you.

| # | Item | Status | Owner | Notes |
|---|------|--------|-------|-------|
| P1 | Add `LICENSE` file (MIT) to repo root | **Done** | [Claude] | Committed to `develop`, merged to `main`. |
| P2 | Add `"license": "MIT"` to `package.json` | **Done** | [Claude] | Committed to `develop`, merged to `main`. |
| P3 | Add `"keywords"` to `package.json` | **Done** | [Claude] | `["mcp", "mcp-server", "project-management", "itm-platform", "ai", "model-context-protocol"]` |
| P4 | Add `"mcpName"` to `package.json` | **Done** | [Claude] | Value: `"io.github.itmplatform/mcp-server"`. |
| P5 | Create `server.json` at repo root | **Done** | [Claude] | Committed to `develop`, merged to `main`. |
| P6 | Create 400x400 PNG logo | **Done** | [Manual] | `zz_Specifications/ITM-Platform-Logo-400px-squared.png` |
| P7 | Republish npm with updated `package.json` | **Done** | [Manual] | Deployed to `main` on 2026-06-12. CI pipeline republished npm. |

### Current state

| Asset | Status |
|-------|--------|
| Public GitHub repo | `github.com/itmplatform/mcp-server` |
| npm package | `@itm-platform/mcp-server` v1.0.3 (carries `mcpName`; published locally, no provenance on this version) |
| Official MCP Registry | ✅ **Live** -- `io.github.itmplatform/mcp-server` v1.0.3, status `active` |
| Hosted remote URL | `https://api.itmplatform.com/v2/_/mcp/` |
| Docs site | `https://developers.itmplatform.com/mcp/` |
| OAuth (DCR + PKCE) | Implemented |
| LICENSE file | **Done** -- MIT, repo root |
| 400x400 PNG logo | **Done** -- `zz_Specifications/ITM-Platform-Logo-400px-squared.png` |
| `server.json` | **Done** -- repo root |
| `mcpName` in package.json | **Done** -- `io.github.itmplatform/mcp-server` |
| `keywords` in package.json | **Done** |
| npm `1.0.3` published | **Done** -- 2026-06-12 (published locally via `npm publish` to skip the slow CI deploy) |

### Reusable assets (use across every form)

| Field | Value |
|-------|-------|
| Name / slug | `itm-platform` |
| Title | `ITM Platform` |
| GitHub repo | `https://github.com/itmplatform/mcp-server` |
| npm package | `@itm-platform/mcp-server` |
| Homepage / docs | `https://developers.itmplatform.com/mcp/` |
| Hosted remote URL | `https://api.itmplatform.com/v2/_/mcp/` |
| **Logo (400x400 PNG, hosted)** | `https://www.itmplatform.com/logos/ITM-Platform-Logo-400px-squared.png` |
| Tool count | `20` (15 read, 5 write) + 6 resources + 4 prompts |
| Auth | OAuth 2.1 + PKCE (hosted) or API key (local stdio) |
| License | MIT |
| Tags | `project-management,portfolio-management,ppm,ai,oauth,productivity` |
| Short description | `Connect AI assistants to ITM Platform projects, tasks, budgets, risks, and team workload.` |

**Server Config (stdio / npx) snippet:**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## 2. Registry-by-Registry Playbook

### 2.1 Official MCP Registry (`registry.modelcontextprotocol.io`)  ✅ PUBLISHED

> **DONE 2026-06-12.** Live as `io.github.itmplatform/mcp-server` v1.0.3, status `active`. Both the npm (stdio) package and the streamable-http remote are registered. Verify any time with:
> ```powershell
> Invoke-RestMethod "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.itmplatform/mcp-server"
> ```

**Why first:** Canonical upstream. PulseMCP and Glama auto-ingest from it. Publish here and you get 2-3 listings for free.

**Submission method:** `mcp-publisher` CLI + `server.json` file + GitHub OAuth

#### How it was done (reference, in case of a re-publish)

Prerequisites that tripped us up:
- **npm package must carry `mcpName`.** The published npm version referenced in `server.json` (`packages[0].version`) must have the `mcpName` field, or publish fails with HTTP 400. We published npm `1.0.3` carrying `mcpName` first, then pointed `server.json` at `1.0.3`.
- **Version convention:** committed `package.json` = published − 1 (CI auto-increments the last digit at publish). To release `1.0.3`, committed `package.json` is `1.0.2`; `server.json` references `1.0.3`.
- **GitHub org membership must be PUBLIC.** The namespace `io.github.itmplatform/*` is only granted if your membership in the `itmplatform` org is public. User `itm-platform` made membership public, then re-logged in.
- **`remotes[].type`** (not `transportType`) and **description ≤ 100 chars**, or `validate` fails.
- The npm package literally named `mcp-publisher` is an **unrelated MCP server** -- do NOT use it. The real CLI is a Go binary from `github.com/modelcontextprotocol/registry` releases, downloaded to `%USERPROFILE%\.mcp-publisher\`.

The publishing token expires fast -- run `login github` immediately before `publish`.

#### Steps (for a future re-publish of a new version)

```powershell
# 1. Authenticate (opens a browser; sign in to the itmplatform GitHub org)
& "$env:USERPROFILE\.mcp-publisher\mcp-publisher.exe" login github

# 2. Validate server.json
& "$env:USERPROFILE\.mcp-publisher\mcp-publisher.exe" validate

# 3. Publish to the registry
& "$env:USERPROFILE\.mcp-publisher\mcp-publisher.exe" publish

# 4. Verify it is live
Invoke-RestMethod "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.itmplatform/mcp-server"
```

**Can be CI-automated later:** Yes, via `mcp-publisher login github-oidc` in GitHub Actions.

---

### 2.2 mcp.so  ✅ SUBMITTED

> **DONE 2026-06-12.** Live at `https://mcp.so/server/itm-platform/itmplatform`.
> **Follow-up:** the listing's **Overview shows "no content"** -- the Content field was empty on first submit. Edit via **Settings → My Servers → Edit Server** and paste the Content markdown below + set Avatar URL to the hosted logo (§1 Reusable assets).
> **Note:** "get server tools failed: no tools found" is expected -- mcp.so auto-launches the server to enumerate tools, but ours requires credentials/OAuth, so discovery returns nothing. Harmless; tools are described in the Overview text instead.

**Why:** Most-cited directory when developers search "list of MCP servers." ~22,000 servers indexed. Highest single-listing SEO value.

**Submission method:** Web form (`https://mcp.so/submit`)

**Field values used:**
- Name: `itm-platform`  •  Title: `ITM Platform`  •  Type: `server`
- Author Name: `itmplatform`  •  Github URL: `https://github.com/itmplatform/mcp-server`
- Avatar URL: `https://www.itmplatform.com/logos/ITM-Platform-Logo-400px-squared.png`
- Tags: `project-management,portfolio-management,ppm,ai,oauth,productivity`
- Description: `Connect AI assistants to ITM Platform project management. Search projects, inspect budgets, summarize portfolio health, create tasks, and log risks and issues using your ITM Platform permissions. 20 tools, OAuth or API key, hosted or local.`
- Server Config: the npx/stdio snippet (see §1 Reusable assets).

**Content markdown (paste into the rich-text Content box):**

```markdown
# ITM Platform MCP Server

Connect [ITM Platform](https://www.itmplatform.com) project and portfolio management to AI assistants through the Model Context Protocol. Works with Claude, VS Code, Cursor, OpenAI Codex, Windsurf, JetBrains AI Assistant, and any MCP-compatible client.

## Capabilities

- **20 tools** (15 read, 5 write): search projects and services, inspect budgets, actuals, revenue and margin, list tasks, risks and issues, aggregate portfolio data, run validated DataMart queries, and create or update tasks, risks, issues and projects.
- **6 resources** and **4 prompt templates** for project status, portfolio overview, team workload, and risk analysis.

## Connect

**Hosted (OAuth 2.1 + PKCE)** -- nothing to install:
`https://api.itmplatform.com/v2/_/mcp/`

**Local (API key)** via npm:
`npx @itm-platform/mcp-server`

The server authenticates as you and returns only data your ITM Platform account is allowed to access.

- Docs: https://developers.itmplatform.com/mcp/
- npm: https://www.npmjs.com/package/@itm-platform/mcp-server
- Repo: https://github.com/itmplatform/mcp-server
```

---

### 2.3 Glama (`glama.ai/mcp`)  ✅ LIVE (auto-ingested)

> **DONE 2026-06-19.** Auto-ingested from the Official MCP Registry / GitHub. No manual submission needed.

**Why:** 32,000+ servers indexed. Scores on license/quality/maintenance. Favors public repos with clear licenses.

**Submission method:** Web form ("Add Server" button) -- not needed; auto-indexed.

**URL:** `https://glama.ai/mcp/servers` (click "Add Server")

**Required fields:**
- Server name
- Description
- Repository URL
- Installation snippet
- Transport type
- Tool count
- One-line capability summary

**Notes:** Glama also auto-indexes from GitHub, so having LICENSE + good README may get you discovered automatically after the official registry listing. Having a LICENSE file (P1) directly impacts Glama's quality score.

**Owner:** Automatic.

---

### 2.4 PulseMCP (`pulsemcp.com`)  ✅ LIVE (auto-ingested)

> **DONE 2026-06-19.** Auto-ingested from the Official MCP Registry within the weekly cycle. No manual submission needed.

**Why:** 17,000+ servers. "Remote Available" filter is used by buyers evaluating hosted MCP servers. Daily updates.

**Submission method:** Web form OR auto-ingest from official registry -- auto-ingest worked.

**URL:** `https://pulsemcp.com/submit`

**Required fields:**
- Submission type: "MCP Server"
- URL: `https://github.com/itmplatform/mcp-server`

**Auto-ingest:** PulseMCP ingests from the Official MCP Registry on a weekly cycle. Confirmed: appeared automatically ~1 week after the official registry listing (2026-06-12).

**Contact for adjustments:** `hello@pulsemcp.com`

**Owner:** Automatic.

---

### 2.5 Cline MCP Marketplace (`github.com/cline/mcp-marketplace`)  ✅ SUBMITTED 2026-06-12

> **DONE.** Issue submitted with repo URL, hosted logo, and the blurb below. Review takes a couple of days.
> **Cline test note:** remote `streamableHttp` + OAuth hung in the installed Cline build during testing. The reliable local test path is stdio + API key (`npx -y @itm-platform/mcp-server` with `ITM_API_URL`/`ITM_COMPANY`/`ITM_API_KEY`). Worth adding an `llms-install.md` to the repo later if Cline reviewers report setup friction.

**Why:** One-click install for Cline users. Reaches the in-editor developer audience. Weaker audience fit (PM tool vs coding), but low effort and a quality backlink.

**Submission method:** GitHub Issue using a template

**URL:** `https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml`

**Template fields (verified 2026-06-12):**
1. **GitHub Repository URL** (required): `https://github.com/itmplatform/mcp-server`
2. **Logo Image** (required, 400x400 PNG): `https://www.itmplatform.com/logos/ITM-Platform-Logo-400px-squared.png`
3. **Installation Testing** (required, two checkboxes -- tick both AFTER testing): "I have tested that Cline can successfully set up this server using only the README.md and/or llms-install.md file" + "The server is stable and ready for public use"
4. **Additional Information** (optional): paste the markdown blurb below.

**Test before ticking the boxes:** In Cline's MCP settings, add a remote server with URL `https://api.itmplatform.com/v2/_/mcp/`, complete OAuth, and confirm the tools list populates.

**Additional Information blurb to paste:**

```markdown
**What it does:** ITM Platform MCP Server connects AI assistants to ITM Platform project & portfolio management. For Cline users it bridges coding to delivery: link merged work to tasks, check project budgets and risks, update task status, and summarize portfolio health without leaving the editor.

**Why it's useful here:** Developers using Cline can close the loop between code and project tracking — e.g. "mark the task for this PR done and flag the project if it's now over budget."

**Connection options:**
- **Hosted (recommended):** remote MCP at `https://api.itmplatform.com/v2/_/mcp/` using OAuth 2.1 (DCR + PKCE). No install, no secrets in config.
- **Local:** `npx @itm-platform/mcp-server` with `ITM_API_URL`, `ITM_COMPANY`, `ITM_API_KEY`.

**Details:** 20 tools (15 read, 5 write), resources, and 4 prompt templates. MIT licensed. Already published to the official MCP registry as `io.github.itmplatform/mcp-server` and listed on Smithery, mcp.so, and mcp.directory. Setup is fully covered in the README; the hosted OAuth path needs no configuration.
```

**Review criteria (per Cline docs):** community adoption, developer credibility, project maturity, security. Timeline: a couple of days.

**Required fields:**
- GitHub Repository URL: `https://github.com/itmplatform/mcp-server`
- Logo Image: **400x400 PNG** (upload or URL) -- **mandatory**
- Installation Testing Confirmation: checkbox confirming Cline can set up the server using README.md alone
- Stability Confirmation: checkbox confirming the server is stable

**Optional:**
- Additional information text area
- `llms-install.md` file in repo for complex setup scenarios

**Before submitting:**
- Create the 400x400 PNG logo (P6)
- Test that Cline can install the server using only the README
- Consider adding an `llms-install.md` with explicit stdio setup steps

**Review timeline:** Typically a few days. Discord `#mcp` channel for questions.

**Owner:** [Manual] -- create GitHub issue + upload logo. Could be partially automated via `gh issue create` but the logo upload and Cline testing make it effectively manual.

---

### 2.6 Smithery (`smithery.ai`)  ✅ PUBLISHED 2026-06-12

> **DONE.** Live as `itmplatform/mcp-server` (gateway `mcp-server--itmplatform.run.tools`). Release succeeded; after OAuth authorization, Smithery discovered **20 tools, 4 prompts, 5 resources**.
> **Setup notes for reference:**
> - Created a Smithery **organization** `itmplatform` (the default namespace was the personal handle `daniel-piret`, derived from the GitHub profile name -- created an org to keep branding consistent).
> - Namespace `itmplatform` / Server ID `mcp-server`; MCP Server URL `https://api.itmplatform.com/v2/_/mcp/`.
> - "Configure connection settings" step → **Skip** (OAuth, no static params).
> - **Visibility:** new servers are **Unlisted** by default. Must click **Change visibility → Public** or it won't appear in search.
> - "No config schema" warning is harmless for OAuth servers.


**Why:** Good discoverability. Does security scanning which adds a trust signal. Fully automatable via CLI.

**Submission method:** Web UI or `smithery` CLI

**URL:** `https://smithery.ai/new`

**Web approach:**
1. Go to `https://smithery.ai/new`
2. Enter the remote server URL: `https://api.itmplatform.com/v2/_/mcp/`
3. Complete the publishing workflow

**CLI approach:**
```powershell
npx @anthropic-ai/smithery mcp publish "https://api.itmplatform.com/v2/_/mcp/" -n @itm-platform/mcp-server
```

**Optional:** Serve a static card at `/.well-known/mcp/server-card.json` with `serverInfo`, `authentication`, `tools`, `resources`, `prompts`. If omitted, Smithery auto-scans the server.

**Owner:** [Manual] -- either fill the web form or run the CLI. ~5 minutes.

---

### 2.7 mcp.directory  ✅ SUBMITTED 2026-06-12

> Submitted with npm package `@itm-platform/mcp-server` and short description. Auto-pulls name/license/tools/README from GitHub. Publishes within ~24h after review.


**Why:** Lightweight submission. Auto-extracts metadata from GitHub. Quality review adds trust.

**Submission method:** Web form

**URL:** `https://mcp.directory/submit`

**Required fields:**
- GitHub Repository URL: `https://github.com/itmplatform/mcp-server`

**Optional fields:**
- npm package name: `@itm-platform/mcp-server`
- Short description (auto-generated from README if omitted)
- Your email (for publication notifications)

**Auto-collected:** project name, description, language, license, README, tool implementations, installation configs for major clients.

**Review timeline:** ~24 hours.

**Owner:** [Manual] -- paste the GitHub URL. Lowest-friction submission (~1 minute).

---

## 3. Submission Order

Recommended sequence, optimized for cascade effects (one listing triggering others):

| Order | Registry | Status | Effort | Cascade effect |
|-------|----------|--------|--------|----------------|
| 1 | **Official MCP Registry** | ✅ **DONE 2026-06-12** -- v1.0.3 active | Medium (CLI setup) | PulseMCP auto-ingests; Glama may auto-index |
| 2 | **mcp.directory** | ✅ **DONE 2026-06-12** (review ~24h) | Trivial (~1 min) | None, but fast approval |
| 3 | **PulseMCP** | ✅ **DONE 2026-06-19** -- auto-ingested | Automatic | None |
| 4 | **Smithery** | ✅ **DONE 2026-06-12** (set visibility → Public) | Low (~5 min) | Security scan = trust signal |
| 5 | **mcp.so** | ✅ **DONE 2026-06-12** (add Content + avatar) | Low (~5 min) | High SEO value |
| 6 | **Glama** | ✅ **DONE 2026-06-19** -- auto-ingested | Automatic | Quality score visible to users |
| 7 | **Cline Marketplace** | ✅ **DONE 2026-06-12** (review ~2 days) | Medium (~20 min) | In-editor install button |

---

## 4. What I Need From You

### Decisions (resolved)

| # | Question | Decision |
|---|----------|----------|
| D1 | License: MIT? | **MIT** -- committed |
| D2 | MCP registry namespace: `io.github.itmplatform/mcp-server`? | **Yes** -- committed in `server.json` and `package.json` |

### Manual actions remaining

| # | Action | Status | Time |
|---|--------|--------|------|
| M1 | Create 400x400 PNG logo | **Done** -- `zz_Specifications/ITM-Platform-Logo-400px-squared.png` | -- |
| M2 | Publish to Official MCP Registry (`mcp-publisher`) | ✅ **Done 2026-06-12** -- v1.0.3 active | -- |
| M3 | Fill mcp.so web form at `https://mcp.so/submit` | ✅ **Done 2026-06-12** (edit to add Content markdown + avatar) | ~2 min left |
| M4 | Fill Glama web form at `https://glama.ai/mcp/servers` (or wait for auto-index) | ✅ **Done 2026-06-19** -- auto-ingested | -- |
| M5 | Submit PulseMCP form at `https://pulsemcp.com/submit` (if auto-ingest does not trigger) | ✅ **Done 2026-06-19** -- auto-ingested | -- |
| M6 | Publish on Smithery at `https://smithery.ai/new` (web or CLI) | ✅ **Done 2026-06-12** (confirm visibility = Public) | ~1 min left |
| M7 | Paste GitHub URL on `https://mcp.directory/submit` | ✅ **Done 2026-06-12** (publishes ~24h) | -- |
| M8 | Create Cline GitHub issue + upload logo + test with Cline | ✅ **Done 2026-06-12** (review ~2 days) | -- |

**All submissions complete.** All seven registries are live as of 2026-06-19. PulseMCP and Glama auto-ingested from the Official MCP Registry as expected.

---

## 5. Automated work (completed)

All automated prerequisites were committed to `develop`, merged to `main`, and npm was republished on 2026-06-12:

1. **`LICENSE`** -- MIT license file at repo root
2. **`server.json`** -- official MCP registry manifest at repo root
3. **`package.json` updates** -- `license`, `mcpName`, `keywords` fields added

The submission sequence can start immediately.

---

## 6. Registries Ruled Out

None. All seven registries are worth listing in. The marginal cost of each additional listing is very low once prerequisites are met.
