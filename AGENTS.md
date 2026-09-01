# ITM.MCP agent instructions

## Required startup

Before investigating, planning, or changing anything:

1. Read `../AGENTS.md`. Its engineering, documentation, testing, security, Git, and deployment rules are mandatory here.
2. Read `../README.md` for platform-wide context and documentation routing.
3. Read this repository's `README.md`.
4. Read `../test-and-build.md` before building or testing.
5. Read the active specification and `zz_Specifications/INDEX.md` when a task changes a documented MCP contract.

Only this repository's root README is mandatory. Nested READMEs are contextual
and should only be read when the task directly concerns their directory.

Before concluding that server, database, Help Scout, logging, or other access
information is unavailable, follow the documentation routing in `../AGENTS.md`
and `../README.md`.

## Repository scope and related repositories

- This repository owns the MCP server, tool and resource schemas, OAuth and API-key transports, REST and DataMart routing, server-side audit behavior, the npm package, and MCP public API documentation.
- `ITM.Tasks` and other platform APIs own canonical write and single-record behavior. `ITM.DataMart` owns analytical reads, `ITM.Web` owns API gateway and OAuth integration, and `ITM.Connector` owns the DataMart extension lifecycle.
- Treat required changes in sibling repositories as separate work in their own Git roots. Keep API gateway routes, REST contracts, DataMart fields, permissions, tool schemas, tests, and published documentation aligned across all affected sides.

## DataMart activation and regeneration

- Current `ITM.Connector` behavior keeps `onEnabled` cheap and idempotent on every active save. Expensive DataMart backfill is in `onActivated`, which runs only on an inactive-to-active transition.
- Activating a tenant still schedules a full tenant regeneration. Never perform bulk production activation or regeneration during business hours. Use approved off-peak batches and the DataMart `/regenerate` or `/regenerate-many` endpoints when explicit regeneration is required.
- During a staged rollout, verify the exact deployed `ITM.Connector` revision and extension template before relying on this split. Older deployments fired regeneration from `onEnabled` on every active save.
- The incident evidence and historical mechanism are in `../zz_Tickets/2026-08-07-api-latency-datamart-regeneration.md`; keep the operative rule here concise and current.

## API and tool changes

- Fact-check the owning API and current deployed behavior before implementing. Use TDD, update the relevant `APIDocs` source and generated tool manifest, then perform an authorized manual end-to-end check.
- Reads use DataMart only where its dataset is complete enough for the contract. Use REST for canonical single-record reads, writes, write readbacks, and data absent from DataMart. Never infer a successful write from eventually consistent DataMart results.
- Enforce permissions and scopes in code. Tool descriptions are guidance, not an authorization boundary. Return actionable validation errors without leaking credentials, tokens, private data, or internal stack details.
- For write tools, read the exact target and current state, validate side effects, write once, read back from the canonical API, and clean up every synthetic E2E record and association.

## Build and test

```powershell
npm test
npm run build
```

- `npm run build` increments `package.json` and regenerates `dist/` before TypeScript compilation. Review the version and generated output; do not leave a validation-only version bump behind.
- `npm run test:integration` and `npm run test:e2e` can call configured services and create data. Run them only against an explicitly named non-production environment with approved credentials and verified cleanup.
- Update unit, scope-enforcement, manifest, integration, and E2E expectations whenever a tool or resource changes. A passing unit suite does not prove the gateway, OAuth, deployed package, or downstream API contract.

## Deployment and publishing

- `origin` is the private Azure DevOps repository; `github` is the public distribution repository. Confirm the intended branch and release flow before pushing either remote.
- Follow the parent promotion and pipeline rules. Do not publish npm, push a release tag, deploy, or promote branches unless the task explicitly authorizes it.
- Verify the exact deployed revision and advertised tool catalog, authenticate through the intended transport, exercise authorized read and write paths with canonical readback, inspect redacted logs, and confirm cleanup. Verify npm contents with `npm pack --dry-run` before publishing.

Credentials and URLs are documented in `../ENVIRONMENTS-AND-ACCESS.md`; never copy secret values into source, tests, logs, tickets, commands, or chat.
