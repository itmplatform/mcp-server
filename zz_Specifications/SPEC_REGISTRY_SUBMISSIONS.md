# MCP Registry Submissions -- Tracking & Playbook

> **Goal:** List the ITM Platform MCP server in every major MCP directory for SEO and discoverability.
>
> **Date:** 2026-06-12

---

## 1. Prerequisites (shared across registries)

Before submitting anywhere, these gaps must be closed. Items marked **[Claude]** can be automated; items marked **[Manual]** need you.

| # | Item | Status | Owner | Notes |
|---|------|--------|-------|-------|
| P1 | Add `LICENSE` file (MIT) to repo root | Pending | [Claude] | Required by Glama scoring, Cline, Smithery, mcp.directory. Also a trust signal on npm. |
| P2 | Add `"license": "MIT"` to `package.json` | Pending | [Claude] | npm shows no license currently. |
| P3 | Add `"keywords"` to `package.json` | Pending | [Claude] | `["mcp", "mcp-server", "project-management", "itm-platform", "ai", "model-context-protocol"]` |
| P4 | Add `"mcpName"` to `package.json` | Pending | [Claude] | Required by official MCP registry. Value: `"io.github.itmplatform/mcp-server"` (must match `server.json` name). |
| P5 | Create `server.json` at repo root | Pending | [Claude] | Required by official MCP registry. See section 2.1 for contents. |
| P6 | Create 400x400 PNG logo | Pending | [Manual] | **Mandatory for Cline.** Nice-to-have for mcp.so and Smithery. Derive from the existing SVG in `APIDocs/public/assets/`. Needs a square crop with the icon mark (not the full horizontal wordmark). |
| P7 | Republish npm with updated `package.json` | Pending | [Manual] | Push to `main` triggers the existing GitHub Actions workflow. Do this after P1-P4 land. |

### Current state

| Asset | Status |
|-------|--------|
| Public GitHub repo | `github.com/itmplatform/mcp-server` |
| npm package | `@itm-platform/mcp-server` v1.0.2, published with `--provenance` |
| Hosted remote URL | `https://api.itmplatform.com/v2/_/mcp/` |
| Docs site | `https://developers.itmplatform.com/mcp/` |
| OAuth (DCR + PKCE) | Implemented |
| LICENSE file | **Missing** |
| 400x400 PNG logo | **Missing** |
| `server.json` | **Missing** |

---

## 2. Registry-by-Registry Playbook

### 2.1 Official MCP Registry (`registry.modelcontextprotocol.io`)

**Why first:** Canonical upstream. PulseMCP and Glama auto-ingest from it. Publish here and you get 2-3 listings for free.

**Submission method:** `mcp-publisher` CLI + `server.json` file + GitHub OAuth

**Steps:**

1. Create `server.json` at repo root (see template below).
2. Add `"mcpName": "io.github.itmplatform/mcp-server"` to `package.json`.
3. Republish npm so the `mcpName` field is live.
4. Install the CLI:
   ```bash
   # macOS
   brew install mcp-publisher
   # or download from GitHub releases
   ```
5. Authenticate:
   ```bash
   mcp-publisher login github
   ```
   This opens a browser OAuth flow. You must be logged into the `itmplatform` GitHub org.
6. Validate:
   ```bash
   mcp-publisher validate
   ```
7. Publish:
   ```bash
   mcp-publisher publish
   ```
8. Verify:
   ```bash
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.itmplatform/mcp-server"
   ```

**`server.json` template:**

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.itmplatform/mcp-server",
  "title": "ITM Platform",
  "description": "Connect AI assistants to ITM Platform project management -- projects, tasks, budgets, risks, and team workload.",
  "version": "1.0.2",
  "websiteUrl": "https://developers.itmplatform.com/mcp/",
  "repository": {
    "url": "https://github.com/itmplatform/mcp-server",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@itm-platform/mcp-server",
      "version": "1.0.2",
      "transport": {
        "type": "stdio"
      },
      "environmentVariables": [
        { "name": "ITM_API_URL", "description": "ITM Platform API gateway URL", "required": true },
        { "name": "ITM_COMPANY", "description": "Your company/account slug", "required": true },
        { "name": "ITM_API_KEY", "description": "Your personal API key", "required": true }
      ]
    }
  ],
  "remotes": [
    {
      "transportType": "streamable-http",
      "url": "https://api.itmplatform.com/v2/_/mcp/"
    }
  ]
}
```

**Owner:** Steps 1-3 are [Claude]. Steps 4-8 are [Manual] (CLI install + auth requires your GitHub session).

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
```bash
smithery mcp publish "https://api.itmplatform.com/v2/_/mcp/" -n @itm-platform/mcp-server
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

| Order | Registry | Depends on | Effort | Cascade effect |
|-------|----------|------------|--------|----------------|
| 1 | **Official MCP Registry** | P1-P5, P7 | Medium (CLI setup) | PulseMCP auto-ingests; Glama may auto-index |
| 2 | **mcp.directory** | P1 (LICENSE) | Trivial (paste URL) | None, but fast approval |
| 3 | **PulseMCP** | Wait ~1 week after #1 | Trivial or automatic | None |
| 4 | **Smithery** | None | Low (web form or CLI) | Security scan = trust signal |
| 5 | **mcp.so** | None | Low (web form) | High SEO value |
| 6 | **Glama** | P1 (LICENSE) | Low (web form or auto) | Quality score visible to users |
| 7 | **Cline Marketplace** | P6 (400x400 PNG) | Medium (Cline testing) | In-editor install button |

---

## 4. What I Need From You

### Decisions

| # | Question | Default |
|---|----------|---------|
| D1 | License: MIT? | MIT (matches what SPEC_MCP_DEPLOYMENT.md assumed) |
| D2 | MCP registry namespace: `io.github.itmplatform/mcp-server`? | Yes (matches GitHub org) |

### Manual actions (cannot be automated)

| # | Action | When | Time |
|---|--------|------|------|
| M1 | Create 400x400 PNG logo from the ITM Platform icon | Before Cline submission | ~15 min in any image editor |
| M2 | Install `mcp-publisher` CLI and run `login github` + `publish` | After P1-P5 land and npm is republished | ~10 min |
| M3 | Fill mcp.so web form | After prerequisites | ~5 min |
| M4 | Fill Glama web form (or wait for auto-index) | After prerequisites | ~5 min |
| M5 | Submit PulseMCP form (if auto-ingest does not trigger) | 1 week after official registry | ~2 min |
| M6 | Publish on Smithery (web or CLI) | After prerequisites | ~5 min |
| M7 | Paste GitHub URL on mcp.directory | After LICENSE exists | ~1 min |
| M8 | Create Cline GitHub issue + upload logo + test with Cline | After P6 (logo) | ~20 min |

**Total manual time estimate:** ~60-70 minutes, spread across a few days (waiting for approvals and auto-ingest).

---

## 5. What Claude Can Do Now

With your go-ahead, I can create these files in a single commit:

1. **`LICENSE`** -- MIT license file at repo root
2. **`server.json`** -- official MCP registry manifest at repo root
3. **`package.json` updates:**
   - Add `"license": "MIT"`
   - Add `"mcpName": "io.github.itmplatform/mcp-server"`
   - Add `"keywords": ["mcp", "mcp-server", "project-management", "itm-platform", "ai", "model-context-protocol"]`

After these land and you push to `main`, the CI pipeline republishes npm with the updated metadata. Then you can start the submission sequence.

---

## 6. Registries Ruled Out

None. All seven registries are worth listing in. The marginal cost of each additional listing is very low once prerequisites are met.
