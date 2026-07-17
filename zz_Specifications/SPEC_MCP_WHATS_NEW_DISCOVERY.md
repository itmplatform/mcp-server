# MCP What's-New Discovery: Server Instructions Banner and Changelog Resource

> **Status:** Pending
> **Date:** 2026-07-17
> **Origin:** v1.0.12 release discussion. New tools ship regularly, but users of already-connected AI clients never learn about them: the agent receives the fresh tool list on every new session, yet the user does not know to ask. Today the only channels are the docs changelog page and ad-hoc emails.

---

## Summary

Two additions, no new tools:

| # | Feature | Mechanism | Cost |
|---|---------|-----------|------|
| 1 | What's-new banner | MCP `initialize` response `instructions` field carries a one-line headline of the latest changelog entry, injected into the model's context by the client on every session | One generated constant + one string builder |
| 2 | Changelog resource | New static MCP resource `itm://changelog` serving the full English changelog markdown | Resource count 6 to 7 |

Both are fed from the existing single source of truth, `APIDocs/src/content/sections/en/changelog.md`, extracted at build time into a compiled module. No runtime file reads, so it works identically for the hosted server (zip deploy) and the npm stdio package (which ships only `dist`, `bin`, `README.md`, `LICENSE`).

Degradation is acceptable by design: clients that ignore `instructions` still get the resource; clients without resource support still get the banner; clients with neither behave exactly as today.

---

## 1. Build-Time Extraction

### Problem

The changelog lives in `APIDocs/src/content/sections/en/changelog.md` (entries are `### vX.Y.Z` headings, followed by a one-line summary paragraph and bold subsections). The npm package does not ship APIDocs, so the content must be embedded at build time, following the same generate-into-source pattern as `scripts/generate-tool-manifest.ts`.

### Design

New script `scripts/generate-whats-new.mjs`:

1. Reads `APIDocs/src/content/sections/en/changelog.md`.
2. Parses the first `### vX.Y.Z` block: `version` (e.g. `1.0.12`) and `headline` (the first non-empty paragraph after the heading, capped at 300 characters).
3. Writes `src/generated/whats-new.ts` exporting:
   - `WHATS_NEW: { version: string; headline: string }`
   - `CHANGELOG_MARKDOWN: string` (the full English changelog, embedded as-is)
4. Fails the build with a clear message if no `### v` heading is found.

Wire into the build: `"build": "node scripts/increase-package-version.mjs && node scripts/generate-whats-new.mjs && tsc"`.

Decisions (explicit to avoid ambiguity):

- **The generated file is committed.** `npm test` runs before `npm run build` on the pipelines, and source imports the module, so it must exist without a build step. Diffs appear only when the changelog changes.
- **Keyed to the changelog, not package.json.** Every `npm run build` bumps the package patch version, but the changelog only changes on real releases. The banner version is the changelog's top entry, so repeated local builds do not drift the banner.
- **English only.** The Spanish changelog exists for the docs site; agents translate on the fly. Not shipping localized instructions or resources.
- **No time-gating.** Changelog entries carry no dates, so the banner always shows the latest entry. It reads "What's new in v1.0.12" until the next release; that is acceptable and matches how docs sites behave.

## 2. Server Instructions Banner

### Problem

`createMcpServer` (server.ts:46-49) passes only `capabilities`; the `instructions` field of the MCP `initialize` response is unused. Clients that support it (Claude Desktop, Claude Code, and others) inject this text into the model's context at session start, which is exactly the channel needed to surface news to users through the agent.

### Design

New exported helper `buildServerInstructions(whatsNew)` in `src/whats-new.ts` returning:

> ITM Platform MCP server: search projects and services, inspect budgets, report progress, and create or update tasks, risks, and issues.
> What's new in v{version}: {headline} Full history: read the `itm://changelog` resource.
> When the user's request touches a recently added capability, briefly mention that it is new so they discover it.

`createMcpServer` passes it as the third constructor option: `new McpServer({ name, version }, { capabilities: {...}, instructions: buildServerInstructions(WHATS_NEW) })`.

Implementation note: confirm the installed `@modelcontextprotocol/sdk` (^1.12.0) `ServerOptions.instructions` passthrough with a quick type check before coding; it has been supported since well before 1.12.

## 3. Changelog Resource

### Design

New `src/resources/changelog.ts`, registered from server.ts alongside the schema and calendar resources, following the `registerSchemaResources` pattern (schemas.ts:25-42):

- Name `changelog`, URI `itm://changelog`, `mimeType: 'text/markdown'`.
- Description: `ITM Platform MCP server changelog -- what changed in each server version, newest first`.
- Handler returns the embedded `CHANGELOG_MARKDOWN`; static content, no REST call, no auth dependency.

Resource count goes from 6 to 7.

---

## 4. House Rules

Implementation must follow `../House-rules.md` (workspace root). The rules that apply directly here:

- **TDD**: main logic (changelog parsing, instructions builder, resource registration) uses red-code-green-refactor-green; edge-case tests added after the code. All tests, previous and new, must pass, and the build must complete without errors or warnings.
- **Code**: reuse existing patterns instead of inventing new ones: the generate-into-source pattern from `generate-tool-manifest.ts`, the resource registration pattern from `schemas.ts`, and the scripts-with-tests pattern from `ensure-ecosystem-app.cjs`. Keep it simple; no runtime markdown parsing, no feature flags.
- **Documentation**: update related docs concisely without duplication (Section 6); update APIDocs as applicable. Commit messages stay short and without authoring.

---

## 5. TDD Plan

### Unit tests

1. Changelog parsing (`tests/unit/generate-whats-new.test.ts`, mirroring `ensure-ecosystem-app.test.ts`): given a fixture markdown with two `### v` entries, extracts the top version and its summary line; caps a 400-character headline at 300; throws on markdown without version headings.
2. `buildServerInstructions`: output contains the version, the headline, the `itm://changelog` pointer, and the mention-it-is-new instruction.
3. Changelog resource (`tests/unit/resources/changelog.test.ts`): registers name `changelog` with URI `itm://changelog` and `text/markdown`; handler returns content starting with the latest `### v` heading; no REST client call is made.
4. Generated module sanity: `WHATS_NEW.version` matches the first version heading in `CHANGELOG_MARKDOWN`.

### E2E tests (`tests/e2e/`)

5. `initialize` response includes a non-empty `instructions` string containing `WHATS_NEW.version`.
6. `resources/list` includes `itm://changelog`; `resources/read` on it returns markdown containing `### v`.

### Scope enforcement

No new tools: tool count stays at 30 and `WRITE_TOOL_NAMES` stays at 10. Resource count assertions (if any are added) move from 6 to 7.

---

## 6. Documentation Plan

| Surface | Change |
|---------|--------|
| `README.md` | "30 MCP tools, 7 resources, and 4 prompt templates"; one sentence in Resources and Prompts about the changelog resource and the what's-new banner |
| `APIDocs .../en+es/changelog.md` | Entry for the release that ships this (also becomes the first banner content) |
| APIDocs resources/overview section | Mention `itm://changelog` where resources are listed, if such a section exists (verify during implementation) |
| `APIDocs tool-manifest.json` | Regenerate (descriptions unchanged, version bump only) |

---

## 7. Rollout

1. Implement per Sections 1-3 with TDD per Section 5.
2. `npm test` + `npm run build` green; commit the generated `src/generated/whats-new.ts`.
3. E2E against local API.
4. Push develop, deploy to stage, verify on stage: `initialize` returns the banner, `resources/read itm://changelog` returns the changelog.
5. Real-client check: connect Claude Desktop or Claude Code to stage, start a new chat, and confirm the agent can answer "what's new in the ITM Platform connection?" without extra prompting.
6. Prod deploy via the standard pipeline flow.
