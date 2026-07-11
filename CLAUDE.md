# CLAUDE.md -- AI Context for ITM.MCP

All project documentation lives in [README.md](README.md). Read it first. 

Before any work, also read:
- [Parent README.md](../README.md) -- access to logs, services, and other repos
- [House-rules.md](../House-rules.md) -- development standards, TDD, test credentials
- [test-and-build.md](../test-and-build.md) -- build and test commands per repo

## Build & Test

```bash
npm test              # unit tests (vitest)
npm run build         # compile TypeScript (tsc)
npm run dev           # HTTP dev server on port 6170 (requires .env)
npm run test:e2e      # E2E tests (requires local ITM.API + DataMart running)
```

Credentials and URLs: [ENVIRONMENTS-AND-ACCESS.md](../ENVIRONMENTS-AND-ACCESS.md)
