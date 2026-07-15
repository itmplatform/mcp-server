# Agent instructions - ITM.MCP

## Required startup

Before investigating, planning, or changing anything:

1. Read `../AGENTS.md` and follow the shared workspace instructions.
2. Read `../README.md` for platform-wide context and documentation routing.
3. Read this repository's `README.md`.
4. Read `../House-rules.md`.
5. Read `../test-and-build.md`.

Only this repository's root README is mandatory. Nested READMEs are contextual
and should only be read when the task directly concerns their directory.

Before concluding that server, database, Help Scout, logging, or other access
information is unavailable, follow the documentation routing in `../AGENTS.md`
and `../README.md`.

## Build and test

```bash
npm test
npm run build
npm run dev
npm run test:e2e
```

Credentials and URLs are documented in `../ENVIRONMENTS-AND-ACCESS.md`.
