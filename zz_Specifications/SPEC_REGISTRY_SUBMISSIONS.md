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
| npm package | `@itm-platform/mcp-server`, published with `--provenance` |
| Hosted remote URL | `https://api.itmplatform.com/v2/_/mcp/` |
| Docs site | `https://developers.itmplatform.com/mcp/` |
| OAuth (DCR + PKCE) | Implemented |
| LICENSE file | **Done** -- MIT, repo root |
| 400x400 PNG logo | **Done** -- `zz_Specifications/ITM-Platform-Logo-400px-squared.png` |
| `server.json` | **Done** -- repo root |
| `mcpName` in package.json | **Done** -- `io.github.itmplatform/mcp-server` |
| `keywords` in package.json | **Done** |
| npm republished from `main` | **Done** -- 2026-06-12 |

---

## 2. Registry-by-Registry Playbook

### 2.1 Official MCP Registry (`registry.modelcontextprotocol.io`)

**Why first:** Canonical upstream. PulseMCP and Glama auto-ingest from it. Publish here and you get 2-3 listings for free.

**Submission method:** `mcp-publisher` CLI + `server.json` file + GitHub OAuth

**Already done (no action needed):** `server.json` created and deployed, `mcpName` added to `package.json`, npm republished, and the `mcp-publisher.exe` CLI downloaded to `%USERPROFILE%\.mcp-publisher\`.

#### Your steps -- run these from the repo root

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

**Gotcha -- namespace must match your login:** `server.json` claims the `io.github.itmplatform/...` namespace, so step 1 must authenticate as a member of the `itmplatform` GitHub org. If your account is not in that org, publish is rejected; either join the org or change the name to `io.github.<your-username>/mcp-server` in `server.json` first.

**Can be CI-automated later:** Yes, via `mcp-publisher login github-oidc` in GitHub Actions.

---

### 2.2 mcp.so

**Why:** Most-cited directory when developers search "list of MCP servers." ~22,000 servers indexed. Highest single-listing SEO value.

**Submission method:** Web form

**URL:** `https://mcp.so/submit`

**Required fields:**
- Server name: `ITM Platform`
- One-sentence description: `Connect AI assistants to ITM Platform project management -- projects, tasks, budgets, risks, and team workload.`
- Tool count: `20`
- Transport type: `Streamable HTTP` and `stdio`
- GitHub repo URL: `https://github.com/itmplatform/mcp-server`
- Homepage URL: `https://developers.itmplatform.com/mcp/`

**Optional fields:**
- Icon: upload the 400x400 PNG if available
- Auth method: OAuth
- Config snippet for Claude Desktop / Cursor (grab from README)
- License: MIT
- Maintainer email / issue tracker URL

**Owner:** [Manual] -- fill the web form. Takes ~5 minutes.

---

### 2.3 Glama (`glama.ai/mcp`)

**Why:** 32,000+ servers indexed. Scores on license/quality/maintenance. Favors public repos with clear licenses.

**Submission method:** Web form ("Add Server" button)

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

**Owner:** [Manual] -- fill the web form. May also appear automatically after prerequisites are met.

---

### 2.4 PulseMCP (`pulsemcp.com`)

**Why:** 17,000+ servers. "Remote Available" filter is used by buyers evaluating hosted MCP servers. Daily updates.

**Submission method:** Web form OR auto-ingest from official registry

**URL:** `https://pulsemcp.com/submit`

**Required fields:**
- Submission type: "MCP Server"
- URL: `https://github.com/itmplatform/mcp-server`

**Auto-ingest:** PulseMCP ingests from the Official MCP Registry on a weekly cycle. If you publish to the official registry first (2.1), PulseMCP should pick it up within ~1 week. Submit manually only if it does not appear after that.

**Contact for adjustments:** `hello@pulsemcp.com`

**Owner:** [Manual] or automatic. Submit the form if it does not appear within a week of the official registry listing.

---

### 2.5 Cline MCP Marketplace (`github.com/cline/mcp-marketplace`)

**Why:** One-click install for Cline users. Reaches the in-editor developer audience.

**Submission method:** GitHub Issue using a template

**URL:** `https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml`

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

### 2.6 Smithery (`smithery.ai`)

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

### 2.7 mcp.directory

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
| 1 | **Official MCP Registry** | Ready -- run `mcp-publisher` | Medium (CLI setup) | PulseMCP auto-ingests; Glama may auto-index |
| 2 | **mcp.directory** | Ready -- paste URL | Trivial (~1 min) | None, but fast approval |
| 3 | **PulseMCP** | Wait until ~2026-06-19 | Trivial or automatic | None |
| 4 | **Smithery** | Ready -- web form or CLI | Low (~5 min) | Security scan = trust signal |
| 5 | **mcp.so** | Ready -- web form | Low (~5 min) | High SEO value |
| 6 | **Glama** | Ready -- web form or auto | Low (~5 min) | Quality score visible to users |
| 7 | **Cline Marketplace** | Ready -- GitHub issue + logo | Medium (~20 min) | In-editor install button |

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
| M2 | Install `mcp-publisher` CLI and run `login github` + `publish` | **Ready** -- all prerequisites met | ~10 min |
| M3 | Fill mcp.so web form at `https://mcp.so/submit` | **Ready** | ~5 min |
| M4 | Fill Glama web form at `https://glama.ai/mcp/servers` (or wait for auto-index) | **Ready** | ~5 min |
| M5 | Submit PulseMCP form at `https://pulsemcp.com/submit` (if auto-ingest does not trigger) | Wait until ~2026-06-19 | ~2 min |
| M6 | Publish on Smithery at `https://smithery.ai/new` (web or CLI) | **Ready** | ~5 min |
| M7 | Paste GitHub URL on `https://mcp.directory/submit` | **Ready** | ~1 min |
| M8 | Create Cline GitHub issue + upload logo + test with Cline | **Ready** | ~20 min |

**Total manual time estimate:** ~50 minutes, spread across a few days (waiting for approvals and auto-ingest).

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
