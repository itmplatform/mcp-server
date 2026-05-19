# MCP Server -- Developer Documentation & APIDocs SPA

> **Status:** Draft
> **Date:** 2026-05-14
> **Depends on:** SPEC_MCP_SERVER.md (Phases 1 & 2 complete, hosted OAuth implemented and working locally)
> **Delivers:** APIDocs SPA at `developers.itmplatform.com/mcp`, markdown content (en/es for end-user, en-only for developer sections), CI/CD pipeline

---

## 1. Goal

Build user-facing documentation for the ITM Platform MCP server. The hosted OAuth server is fully developed and working locally; all documentation treats it as real and shipping. The audience is threefold:

1. **End users** (project managers, admins) who want to connect an AI assistant to their ITM Platform account
2. **Developers** building integrations or self-hosting the server
3. **Internal team** who need to understand the MCP architecture and OAuth flow

The documentation will be a React SPA following the same pattern as the DataMart APIDocs (`ITM.DataMart/APIDocs/`), deployed alongside it at `developers.itmplatform.com/mcp`.

### What MCP docs are NOT

MCP documentation is not an API reference in the traditional sense. Users never call tools directly -- the AI does. There is no "Try It" panel, no request builder, no curl playground. Instead the docs explain:

- What the AI can do on behalf of the user
- How to connect the user's AI client to ITM Platform
- What authentication is required and how it works

---

## 2. Content Architecture

### 2.1 Section Plan

Content is organized as markdown files in `APIDocs/src/content/sections/`. Each section maps to a sidebar entry and a scroll target. No React Router -- hash anchors + scroll tracking (same as DataMart).

Sections are split into two tracks. **End-user** sections are translated into both English and Spanish. **Developer** sections are English-only because they change frequently and are read comfortably in English by Spanish-market developers.

| # | Section ID | Title (en) | Track | Purpose |
|---|-----------|------------|-------|---------|
| 1 | `what-can-it-do` | What Can the AI Do? | end-user | Short intro paragraph followed by the ToolCatalog component in overview mode (name + one-line description per tool, grouped by category). This is the landing section -- the user sees capabilities before anything else. |
| 2 | `setup-overview` | Getting Started | end-user | Overview of the two connection modes: local (stdio) and hosted (HTTP + OAuth). Decision tree: "Are you running an AI client on your machine? Use stdio. Want zero install? Use the hosted server." Includes a brief "How MCP works" aside covering the essential protocol concept (AI client spawns or connects to a server that calls ITM APIs on your behalf). |
| 3 | `setup-stdio` | Local Setup (API Key) | end-user | Step-by-step: generate API key, install/configure for each AI client. Includes the ConfigPanel component (Section 3.2). |
| 4 | `setup-oauth` | Hosted Setup (OAuth) | end-user | Step-by-step: click connect in your AI client, authorize via ITM Platform login, done. Explains what OAuth does without requiring the user to understand it. |
| 5 | `ai-clients` | Supported AI Clients | end-user | Per-client setup instructions: Claude Desktop, Claude Code, OpenAI Codex, VS Code Copilot, Cursor, JetBrains. Each gets a subsection with exact config snippets. |
| 6 | `write-operations` | Write Operations | end-user | Explain write tools, confirmation model, stale-after-write behavior (DataMart eventual consistency). Safety design: audit logging, scope requirements. |
| 7 | `access-control` | Access Control | end-user | License types and what each can do. CompanyAdmin/FullUser = full access. ProjectManager = scoped. TeamMember = blocked. |
| 8 | `revoke-and-audit` | Revoking Access & Reviewing Activity | end-user | How to revoke an AI client's access (regenerate API key, or revoke OAuth grant). How to see what the AI changed: audit log entries per write operation, where to find them, what fields are recorded (who, when, what tool, what changed). This is trust-critical for users granting write access to financial and project data. |
| 9 | `faq` | FAQ | end-user | Concise answers to expected questions: "Is my data sent to the AI company?", "Can the AI modify my projects?", "Which AI clients are supported?" |
| 10 | `tools-reference` | Tool Reference | developer | The ToolCatalog component in detail mode: all tools with full parameter tables, editorial narratives ("what the AI does with this"), and example responses. Tool data comes from the generated manifest + editorial supplement (Section 3.3). No hand-authored parameter tables in markdown. |
| 11 | `resources` | Resources & Prompts | developer | Explain the 6 resources (schemas, calendars) and 4 prompts (project_status, portfolio_overview, team_workload, risk_analysis). |
| 12 | `authentication` | Authentication Deep Dive | developer | API key model, OAuth 2.1 flow, token exchange, scope enforcement (`mcp:read` vs `mcp:write`). Architecture diagrams. Cross-references `revoke-and-audit` for the user-facing view of audit logging. |
| 13 | `self-hosting` | Self-Hosting Guide | developer | For developers who want to run the server themselves: clone, build, configure, deploy. npm package usage. Environment variables reference. |
| 14 | `troubleshooting` | Troubleshooting | developer | Common issues: server won't start (identity resolution timeout), tools not appearing (build path mismatch), OAuth errors, DataMart lag after writes. |
| 15 | `changelog` | Changelog | developer | Version history of the MCP server: new tools, changed parameters, breaking changes. Pinned to the server version from `package.json`. The Header component displays the current version so readers know what they are looking at. |

**Design note on `what-is-mcp` removal:** The standalone "What is MCP?" section was demoted because end users care about capabilities first, not protocol theory. The essential concept ("your AI client talks to ITM via a standard protocol") is absorbed into the `setup-overview` section as a short aside. Developers who want protocol details get them in `authentication`.

### 2.2 Section Order

Defined in `APIDocs/src/content/types.ts` as a `SECTION_ORDER` array (same pattern as DataMart):

```ts
export const SECTION_ORDER = [
  // End-user track (en + es)
  'what-can-it-do',
  'setup-overview',
  'setup-stdio',
  'setup-oauth',
  'ai-clients',
  'write-operations',
  'access-control',
  'revoke-and-audit',
  'faq',
  // Developer track (en only)
  'tools-reference',
  'resources',
  'authentication',
  'self-hosting',
  'troubleshooting',
  'changelog',
] as const;
```

### 2.3 Markdown Format

Pure GFM (GitHub Flavored Markdown). No frontmatter. Same as DataMart sections.

Placeholders like `{your-account}` are replaced at render time with the user's company slug (entered via the company input in the Header -- see Section 3.2).

### 2.4 Localization

English and Spanish, with a split policy:

- **End-user sections** (9 sections): translated into both `en/` and `es/`.
- **Developer sections** (6 sections): English only. These change most often and are read fine in English by Spanish-market developers. Translating them would double maintenance on the most volatile content.
- **UI strings** (`ui/en.json`, `ui/es.json`): fully translated. All chrome (header, sidebar labels, buttons) appears in the selected locale regardless of section track.

The `es/` directory contains only the 9 end-user markdown files. The `guide-sections.ts` loader falls back to `en/` when a section file does not exist in the selected locale (same fallback pattern as DataMart).

---

## 3. Interactive Components

### 3.1 Key Difference from DataMart APIDocs

DataMart docs have a query runner (CodeMirror editor + execute button + response viewer). MCP docs do NOT have this because users don't call MCP tools directly. Instead, the interactive elements are:

| Component | What it does | DataMart equivalent |
|-----------|-------------|-------------------|
| **ConfigPanel** | User picks AI client, sees exact config snippet, copies it | QueryPanel (but for config, not queries) |
| **ToolCatalog** | Searchable/filterable tool list with expandable details, driven by generated manifest + editorial supplement | Schema explorer |
| **CompanyInput** | Text input in Header where the user types their company slug for config personalization | LoginDialog (but no auth, no token, no API call) |

### 3.2 ConfigPanel (new component)

The centerpiece of the setup sections. Behavior:

1. User selects their AI client from a tab bar: Claude Desktop | Claude Code | Codex | VS Code | Cursor | JetBrains
2. Panel shows the exact configuration file content for that client (JSON, TOML, or settings format)
3. If the user has entered a company slug in the Header input, config snippets replace `{your-account}` with that value. Otherwise the placeholder remains with an instruction to fill it in.
4. Copy button copies the snippet to clipboard
5. Below the snippet: "Where to put this file" instructions (file path per OS)

Example output for Claude Desktop (company slug entered as `testsmarter`):

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "itm-mcp"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "testsmarter",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

For hosted/OAuth clients, the config is simpler:

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "http",
      "url": "https://mcp.itmplatform.com/mcp"
    }
  }
}
```

### 3.3 ToolCatalog (new component)

Displays all tools in a searchable, categorized list. Two rendering modes:

- **Overview mode** (used in `what-can-it-do`): tool name + one-line description per tool, grouped by category. No parameter tables, no example responses.
- **Detail mode** (used in `tools-reference`): full parameter table, editorial narrative ("what the AI does with this"), and collapsible example response.

#### Data source

Tool names, descriptions, and parameter schemas are NOT hand-authored in markdown or component code. They come from a **build-time generated manifest** produced by introspecting the MCP server's actual tool definitions (the same data the server returns for `tools/list`).

| File | Source | Contains |
|------|--------|----------|
| `src/content/tool-manifest.json` | Generated at build time by `scripts/generate-tool-manifest.ts` | Tool name, description, JSON Schema for parameters, server version. Canonical -- never hand-edited. |
| `src/content/tool-supplement.ts` | Hand-maintained | Editorial content keyed by tool name: `narrative` ("what the AI does with this"), `exampleResponse` (sample JSON), `category` (grouping label). Only content that cannot be derived from the server. |

The ToolCatalog component merges both at render time: manifest provides the schema, supplement provides the editorial. A tool that exists in the manifest but not the supplement still renders (with schema only). A supplement entry for a tool not in the manifest is a build warning.

#### Manifest generation

The script `scripts/generate-tool-manifest.ts`:

1. Spawns the MCP server in stdio mode as a child process (`node dist/server.js`)
2. Sends an MCP `initialize` request, then `tools/list`
3. Captures the response (tool names, descriptions, JSON Schema input schemas)
4. Reads the server's `package.json` version field
5. Writes `APIDocs/src/content/tool-manifest.json` with the tool list + version
6. Kills the child process

This requires a prior `npm run build` of the MCP server and valid `.env` credentials (same as running tests). The generation step runs as a `predev` / `prebuild` script in the APIDocs `package.json` (Section 4.3).

**Assumptions:** The script needs network access to ITM.API for identity resolution at server startup. If this is impractical in CI, an alternative is to commit the generated manifest and regenerate it manually when tools change. State the chosen approach during implementation.

Categories: Projects & Services | Tasks | Financials | Risks & Issues | Portfolio | Users & Reference | Write Operations

### 3.4 Version Display

The Header component displays the MCP server version string (e.g., "v1.0.0") sourced from the generated manifest. This tells readers which server version the documentation describes.

---

## 4. Technical Stack

Follow the DataMart APIDocs stack exactly:

| Concern | Technology | Notes |
|---------|-----------|-------|
| Framework | React 18 + TypeScript | Same as DataMart |
| Build | Vite | Same env modes: dev, stage, prod |
| Styling | Tailwind CSS | Same dark/light/system theming via CSS variables |
| Markdown | react-markdown + remark-gfm | Same rendering pipeline |
| i18n | Context provider + `t()` function | Same `useLocale` hook pattern |
| Theming | `useTheme` hook | Same light/dark/system cycle |
| Code display | Syntax-highlighted code blocks | For config snippets (no CodeMirror needed -- read-only display) |

### 4.1 Directory Structure

```
ITM.MCP/APIDocs/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── .env.local                    # VITE_API_HOST for local dev
├── .env.stage
├── .env.prod
├── public/
│   └── assets/                   # Logo, icons
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                 # Tailwind + CSS variables
│   ├── content/
│   │   ├── types.ts              # Section, Locale types + SECTION_ORDER
│   │   ├── guide-sections.ts     # getGuideSections(locale) with en fallback
│   │   ├── tool-manifest.json    # GENERATED -- do not hand-edit
│   │   ├── tool-supplement.ts    # Hand-maintained editorial (narratives, examples, categories)
│   │   ├── sections/
│   │   │   ├── en/               # 15 markdown files (all sections)
│   │   │   │   ├── what-can-it-do.md
│   │   │   │   ├── setup-overview.md
│   │   │   │   ├── setup-stdio.md
│   │   │   │   ├── setup-oauth.md
│   │   │   │   ├── ai-clients.md
│   │   │   │   ├── write-operations.md
│   │   │   │   ├── access-control.md
│   │   │   │   ├── revoke-and-audit.md
│   │   │   │   ├── faq.md
│   │   │   │   ├── tools-reference.md
│   │   │   │   ├── resources.md
│   │   │   │   ├── authentication.md
│   │   │   │   ├── self-hosting.md
│   │   │   │   ├── troubleshooting.md
│   │   │   │   └── changelog.md
│   │   │   └── es/               # 9 markdown files (end-user sections only)
│   │   │       ├── what-can-it-do.md
│   │   │       ├── setup-overview.md
│   │   │       ├── setup-stdio.md
│   │   │       ├── setup-oauth.md
│   │   │       ├── ai-clients.md
│   │   │       ├── write-operations.md
│   │   │       ├── access-control.md
│   │   │       ├── revoke-and-audit.md
│   │   │       └── faq.md
│   │   └── ui/
│   │       ├── en.json
│   │       └── es.json
│   ├── components/
│   │   ├── Header.tsx            # Logo, version badge, company input, locale switcher, theme toggle
│   │   ├── Sidebar.tsx           # Section navigation (end-user / developer track divider)
│   │   ├── GuideSection.tsx      # Section title + markdown content
│   │   ├── ConfigPanel.tsx       # AI client picker + config snippet + copy
│   │   ├── ToolCatalog.tsx       # Searchable tool list (overview + detail modes)
│   │   ├── ToolDetail.tsx        # Expandable tool params + example
│   │   ├── CompanyInput.tsx      # Text input for company slug (replaces LoginDialog)
│   │   ├── ThemeToggle.tsx       # Light/dark/system
│   │   ├── LocaleSwitcher.tsx    # en/es toggle
│   │   └── CopyButton.tsx        # Clipboard copy with feedback
│   ├── hooks/
│   │   ├── useLocale.ts
│   │   ├── useTheme.ts
│   │   ├── useCompanySlug.ts     # Stores slug in localStorage, provides to ConfigPanel
│   │   └── useScrollTracker.ts
│   └── utils/
│       └── constants.ts          # STORAGE_KEYS
├── scripts/
│   └── generate-tool-manifest.ts # Spawns MCP server, calls tools/list, writes manifest
```

### 4.2 Environment Modes

| Mode | `VITE_MCP_URL` | Deploy target |
|------|----------------|---------------|
| local | `http://localhost:6160/mcp` | Dev only |
| stage | `https://mcp-stage.itmplatform.com/mcp` | Stage |
| prod | `https://mcp.itmplatform.com/mcp` | `developers.itmplatform.com/mcp` |

Note: `VITE_API_HOST` is not needed because the docs SPA does not call ITM.API directly. The company slug is entered by the user and used only for client-side placeholder substitution.

### 4.3 Build Scripts

```json
{
  "predev": "tsx ../scripts/generate-tool-manifest.ts",
  "dev": "vite",
  "prebuild": "tsx ../scripts/generate-tool-manifest.ts",
  "build": "tsc && vite build --mode prod",
  "build:stage": "tsc && vite build --mode stage",
  "build:prod": "tsc && vite build --mode prod",
  "preview": "vite preview",
  "test": "vitest run --passWithNoTests"
}
```

The `predev` and `prebuild` hooks run the manifest generation script before the Vite dev server or production build starts. This ensures `tool-manifest.json` is always fresh.

---

## 5. Content Guidelines

### 5.1 Voice and Tone

- **End-user sections** (1-9): plain language, no jargon. Assume the reader knows ITM Platform but not MCP, OAuth, or AI protocols. Use "you" and "your". Short paragraphs.
- **Developer sections** (10-15): technical but accessible. Use proper terminology. Include code snippets and tables. Same style as the DataMart APIDocs.
- **Both**: avoid marketing language. State facts. Show, don't tell.

### 5.2 Diagrams

Use text-based diagrams in markdown (same as SPEC_MCP_SERVER.md). Example:

```
You ask a question
  |
  v
AI Client (Claude, Codex, VS Code...)
  |  spawns MCP server or connects via URL
  v
ITM MCP Server
  |  authenticates as you, calls ITM APIs
  v
Your ITM Platform Data
```

### 5.3 Tool Supplement Entries

Tool names, descriptions, and parameter schemas come from the generated manifest (Section 3.3) and are never authored in markdown. The editorial supplement (`tool-supplement.ts`) provides the content that cannot be derived from the server:

```ts
export const toolSupplement: Record<string, ToolEditorial> = {
  search_projects: {
    category: 'Projects & Services',
    narrative: 'When you ask "Which projects are behind schedule?", the AI calls '
      + 'this tool with a status filter and examines the results to answer your question.',
    exampleResponse: {
      projects: [
        { id: 75868, name: 'Website Redesign', statusLabel: 'In Progress', percentComplete: 65 },
      ],
      total: 12,
    },
  },
  // ... one entry per tool
};
```

Guidelines for writing supplement entries:

- **`category`**: one of the fixed category labels. Used for grouping in ToolCatalog.
- **`narrative`**: one or two sentences explaining what the AI does with this tool, written from the user's perspective ("When you ask X, the AI calls this tool..."). Avoid restating the description (the manifest already has it).
- **`exampleResponse`**: a realistic but anonymized JSON snippet. Keep it short -- enough to show the shape, not every field.

### 5.4 Config Snippet Pattern

Each AI client section shows the exact file to edit, the exact JSON/TOML to paste, and where to find the file:

```markdown
### Claude Desktop

**Config file:** `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

**Add this to the file:**

(ConfigPanel component renders here with the user's company slug if entered)

**Hosted alternative** (no install, OAuth):

(ConfigPanel component renders the HTTP variant)
```

---

## 6. Deployment

### 6.1 Pipeline

Follow the DataMart APIDocs deployment pattern:

1. Azure Pipelines builds the `APIDocs/dist/` artifact
2. SCP to `/var/www/developers.itmplatform.com/htdocs/mcp` on the AWS EC2 instance
3. Live at `https://developers.itmplatform.com/mcp`

Pipeline file: `ITM-MCP-Docs.yml` (or add as a stage to an existing MCP pipeline).

### 6.2 Build Triggers

- Merge to `main` triggers prod build + deploy
- Merge to `stage` triggers stage build only (no deploy, or deploy to a stage URL if one exists)

---

## 7. Relationship to Other Documentation

| Documentation | Audience | URL | What it covers |
|--------------|----------|-----|---------------|
| REST API Docs | Developers | `developers.itmplatform.com/documentation` | v2 REST endpoints (Stoplight Elements) |
| DataMart Docs | Developers | `developers.itmplatform.com/datamart` | GraphQL queries, schema, interactive examples |
| **MCP Docs** (this spec) | **End users + developers** | `developers.itmplatform.com/mcp` | **AI assistant integration, tool catalog, setup guides** |

The MCP docs should link to the REST API and DataMart docs where relevant (e.g., "For direct API access without an AI assistant, see the REST API documentation").

---

## 8. Implementation Steps

| # | Step | Description | Status |
|---|------|-------------|--------|
| 1 | Scaffold APIDocs SPA | Initialize Vite + React + Tailwind project in `ITM.MCP/APIDocs/`. Copy structural patterns from DataMart APIDocs (hooks, theme, locale, types). | ⬜ |
| 2 | Build manifest generation script | `scripts/generate-tool-manifest.ts`: spawn MCP server, call `tools/list`, write `tool-manifest.json` with tool schemas + server version. | ⬜ |
| 3 | Write tool supplement | Author `tool-supplement.ts` with editorial content (category, narrative, exampleResponse) for each tool. | ⬜ |
| 4 | Build ToolCatalog component | Searchable tool list with overview and detail modes. Reads manifest + supplement, merges by tool name. | ⬜ |
| 5 | Build ConfigPanel component | Client picker + config snippet renderer + copy button. Reads company slug from `useCompanySlug` hook for placeholder substitution. | ⬜ |
| 6 | Build remaining components | Header (with version badge and CompanyInput), Sidebar (with track divider), ThemeToggle, LocaleSwitcher, GuideSection, CopyButton. | ⬜ |
| 7 | Write English content | Author all 15 markdown sections in `sections/en/`. The `what-can-it-do` and `tools-reference` sections are thin wrappers around the ToolCatalog component -- their markdown provides only intro prose. | ⬜ |
| 8 | Integrate and test | Wire up sections + components. Verify scroll tracking, theme switching, locale switching, company slug personalization, manifest loading. | ⬜ |
| 9 | Write Spanish content | Translate the 9 end-user sections to Spanish. Translate all UI strings in `ui/es.json`. | ⬜ |
| 10 | Set up pipeline | Azure Pipelines config to build and deploy APIDocs to `developers.itmplatform.com/mcp`. Include manifest generation in the build (requires MCP server build + `.env` in CI, or committed manifest). | ⬜ |
| 11 | Cross-link | Add links from the ITM Platform help center and other docs to the MCP docs. Add links from MCP docs to REST API and DataMart docs. | ⬜ |

---

## 9. Open Questions

| Question | Context |
|----------|---------|
| Help center integration | Should the MCP docs be linked from the ITM Platform help center (help.itmplatform.com)? If so, where? |
| Video content | Would a short setup walkthrough video be valuable? If so, embed in the `setup-overview` section. |
| Manifest generation in CI | The manifest script needs ITM.API access. Options: (a) give CI a service API key, (b) commit the generated manifest and regenerate manually when tools change. Which approach? |
| Audit log visibility | The `revoke-and-audit` section promises users can see what the AI changed. Is there currently a UI or API endpoint exposing `tblMcpAuditLog` entries to users, or does this need to be built? If it needs building, that is a dependency outside this spec. |
| Sidebar track divider | Should the Sidebar visually separate end-user and developer sections (e.g., a labeled divider or collapsible group), or present them as a flat list? |
