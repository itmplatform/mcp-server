# Ticket: OAuth token exchange 401 on MCP session initialization
NOTHING TO DO. No 401 to the client. Archiving

Date investigated: 2026-07-11
Related: [mcp-ucloud-401-token-row-overwrite](done/mcp-ucloud-401-token-row-overwrite.md)
Area: ITM.MCP, ITM.Account (token exchange endpoint)

## Summary

Since the Option 4 fix (commit `873d5ea`, deployed 2026-07-06), **zero downstream 401s** have occurred -- the reactive retry + proactive session-token refresh is working as intended for DataMart and REST calls.

However, a **different** 401 pattern has been observed: the initial OAuth bearer-to-session-token exchange (`exchangeToken` at `server.ts:228`) fails intermittently with 401 during MCP `initialize` requests. This is NOT the same as the previously fixed tblUserToken-overwrite issue. Here the bearer token itself is rejected by ITM.Account's `/token-exchange` endpoint before a session token is ever created.

## Evidence

### Post-fix 401 counts (downstream -- the original bug)

| Date | DataMart 401 | REST 401 | Tool failures | re-exchange triggered |
|------|-------------|---------|---------------|----------------------|
| July 7 | 0 | 0 | 0 | 0 |
| July 8 | 0 | 0 | 0 | 0 |
| July 9 | 0 | 0 | 0 | 0 |
| July 10 | 0 | 0 | 0 | 0 |
| July 11 | 0 | 0 | 0 | 0 |

The proactive session-token refresh (`"Session token refreshed"`) fires correctly on long-lived sessions, preventing downstream 401s entirely.

### New issue: "Token exchange failed" 401 at session creation

| Date | Token exchange 401 events |
|------|---------------------------|
| July 7 | 0 |
| July 8 | 7 |
| July 9 | 9 |
| July 10 | 7 |
| July 11 | 1 |

**Total: 24 events across 4 days.**

### Pattern details

Every failure follows the same shape:

```
[07:02:11.811] ERROR Token exchange failed {"status":401}
[07:02:11.811] ERROR OAuth token exchange failed
    Error: Token exchange failed: 401 Unauthorized
        at exchangeToken (oauth-auth.ts:41)
        at Server.<anonymous> (server.ts:228)
[07:02:12.152] INFO  Token exchange succeeded {"userId":174,"company":"itmrozas"}
[07:02:12.152] INFO  Per-session auth resolved {"userId":174}
```

Key observations:

1. **Every failure is immediately followed by success** (~300-400ms gap). The MCP client (Claude.ai) receives the 401, refreshes its OAuth access token, retries `initialize`, and succeeds.

2. **Concentrated on userId=174 (itmrozas)** -- an internal user. All 24 failed exchanges are immediately followed by a successful exchange for this user.

3. **21:00 UTC daily recurrence** -- a failure appears at exactly ~21:00:02 UTC on July 8, 9, 10, and 11. Suggests a scheduled/automated session or a token expiry boundary aligned to a fixed schedule.

4. **04:00 UTC cluster** -- failures at ~04:00 UTC on July 9, 10, and 11.

5. **uCloud users (62847, 62585) show zero 401 errors** -- all their exchanges succeed on first attempt.

### uCloud activity post-fix (no issues found)

userId=62847 (g.cezar@ucloudglobal.com, account ucloud):

| Date | Sessions | Tool calls | 401 errors |
|------|----------|------------|------------|
| July 8 | 12:53, 18:54 | search_projects, list_project_tasks, query_datamart, get_project_budget | 0 |
| July 11 | 12:40, 16:32, 18:40, 19:49, 20:15 | search_projects, list_project_tasks, query_datamart, get_project_budget (25+ calls) | 0 |

userId=62585 (account ucloud):

| Date | Sessions | 401 errors |
|------|----------|------------|
| July 8 | 16:08, 18:39, 23:53 | 0 |
| July 10 | 20:10 (x2) | 0 |
| July 11 | 00:23 | 0 |

All uCloud tool invocations completed successfully. Proactive session refresh also worked for their sessions.

## Code path

The failure occurs at the `initialize` request handler:

- `server.ts:228` -- calls `exchangeToken(oauthToken, oauthConfig, log)`
- `oauth-auth.ts:30-41` -- POSTs the bearer token to `ITM_AUTH_URL/token-exchange`
- ITM.Account's `TokenExchangeController` validates the bearer token and returns 401

The MCP server returns HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="..."` to the client (`server.ts:245-251`). The client is then responsible for token refresh and retry.

## Root cause hypothesis

The OAuth access token has a limited lifetime. When the client (Claude.ai) reconnects after the access token has expired, it presents the stale token on the first `initialize` attempt. ITM.Account rejects it. The client then uses its refresh_token to obtain a new access_token and retries.

This is technically valid OAuth 2.0 behavior, but it introduces:
- An unnecessary round trip on every session where the access token has expired
- A visible error if the client does not handle the 401 gracefully
- ~300-400ms added latency on affected session initializations

## Possible fixes

1. **No-op (current state)**: The client handles the retry. If the user never sees an error, this is cosmetic.

2. **Pre-check token validity in the MCP client**: The MCP client could check access_token expiry before sending and proactively refresh. This is outside our control (depends on Claude.ai / third-party MCP client behavior).

3. **Accept refresh_token in the exchange endpoint**: If the client sends an expired access_token, ITM.Account could try the refresh_token (if provided) before returning 401. This would require changes to the token exchange protocol.

4. **Log the bearer token's `exp` claim on failure**: Decode the JWT (without verification) to log whether the token was actually expired vs. revoked vs. malformed, to narrow the root cause.

## Status

Investigation only. No fix applied. The user-facing impact depends on whether the MCP client surfaces the transient 401 as an error to the end user.
