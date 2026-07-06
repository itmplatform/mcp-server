# Ticket: uCloud MCP DataMart 401s from legacy token-row overwrite

Date investigated: 2026-07-06
Help Scout: https://secure.helpscout.net/conversation/3377710474/11440/
Area: ITM.MCP, ITM.Account, ITM.Web/ITM.API token table

## Summary

uCloud reported intermittent `DataMart request failed: 401 Unauthorized` errors from the hosted MCP server (`https://api.itmplatform.com/v2/_/mcp/`) through Claude.

This is not a `query_datamart`-specific scope issue and not a DataMart GraphQL permission issue. The failing tools are DataMart-backed, and the 401 is returned by the ITM.API gateway while validating the downstream ITM session token that ITM.MCP sends to `/v2/{company}/datamart/graphql`.

Root cause: ITM.MCP stores a short-lived `mcp_...` session token in `tblUserToken`, but legacy token stored procedures update/delete token rows by `(intAccountId, intUserId)` only, not by the token value. Any legacy token refresh/update for the same user can overwrite all of that user's token rows, including the MCP row. ITM.MCP keeps using its cached `mcp_...` token, so the next DataMart/audit gateway call returns 401.

## Evidence

Customer/user:

- Account: `ucloud`, `AccountId=29908`
- User: `g.cezar@ucloudglobal.com`, `UserId=62847`
- Roles/license types: active user with `Full Access (PPM):1` plus `Team Member (PPM):3`
- OAuth scope in refresh-token table: `mcp:read mcp:write`

MCP production audit rows on 2026-07-06:

- `12:42:37 UTC` `search_projects` success
- `12:42:42 UTC` `get_project` success
- `12:43:10 UTC` `get_project` success

MCP production logs around the ticket window:

- `12:30:10` `query_datamart` -> DataMart 401, audit POST 401
- `12:31:07` `aggregate_portfolio` -> DataMart 401, audit POST 401
- `12:32:14` `get_project` -> DataMart 401, audit POST 401
- `12:33:45` `get_project_budget` -> DataMart 401, audit POST 401
- `12:33:51` `search_projects` -> DataMart 401, audit POST 401
- `12:34:01` `list_project_tasks` -> DataMart 401, audit POST 401
- `12:42:37` token exchange succeeded, followed by successful DataMart tools
- `12:45:18` `query_datamart` -> DataMart 401, audit POST 401
- `12:46:04` `get_project` -> DataMart 401, audit POST 401
- `12:46:13` `search_projects` -> DataMart 401, audit POST 401
- `12:47:17` `get_project` -> DataMart 401, audit POST 401

Current token-table shape after the incident:

```sql
SELECT COUNT(*) AS TokenRows,
       COUNT(DISTINCT Token) AS DistinctTokens,
       MIN(TokenExpireTime) AS MinExpire,
       MAX(TokenExpireTime) AS MaxExpire,
       SUM(CASE WHEN Token LIKE 'mcp_%' THEN 1 ELSE 0 END) AS McpRows,
       SUM(CASE WHEN Token NOT LIKE 'mcp_%' THEN 1 ELSE 0 END) AS LegacyRows
FROM dbo.tblUserToken WITH (NOLOCK)
WHERE intAccountId = 29908 AND intUserId = 62847;
```

Result:

- `TokenRows=7`
- `DistinctTokens=1`
- `McpRows=0`
- `LegacyRows=7`
- all rows have the same long legacy expiry

This is the signature of a broad legacy token update overwriting multiple rows for the same user.

## Code Path

ITM.MCP token exchange:

- `ITM.MCP/src/auth/oauth-auth.ts`
- `ITM.Account/ITM.Account/Controllers/TokenExchangeController.cs`
- `ITM.Account/ITM.Account/SessionTokenManager.cs`
- `ITM.Account/ITM.Account/DA/SessionTokenDA.cs`

MCP inserts a separate session row:

```sql
INSERT INTO dbo.tblUserToken (intAccountId, intUserId, Token, TokenExpireTime)
VALUES (@intAccountId, @intUserId, @Token, @TokenExpireTime)
```

Gateway validation for DataMart:

- `ITM.MCP/src/clients/datamart-client.ts` sends `Token: {mcp session token}`
- `ITM.Web/ITM.API/APIGateway.json` routes `v2/{AccountId}/datamart/graphql` with `"auth": "token"`
- `ITM.Web/ITM.API/APIGateway/DA/UserTokenManagerDA.cs` validates exact token and expiry

Legacy overwrite:

```sql
CREATE OR ALTER PROCEDURE [dbo].[tblUserTokenUpdate] (
 @intAccountId INT,
 @intUserId INT,
 @Token VARCHAR(MAX),
 @TokenExpireTime DATETIME
)
AS
SET NOCOUNT ON

DECLARE @DiffHours INT
SELECT @DiffHours = DATEDIFF(HOUR,GETDATE(),[TokenExpireTime])
FROM [tblUserToken] WITH(NOLOCK)
WHERE intAccountId = @intAccountId AND intUserId = @intUserId

IF @DiffHours <= 24
BEGIN
  UPDATE [tblUserToken]
  SET [Token] = @Token,
      [TokenExpireTime] = @TokenExpireTime
  WHERE intAccountId = @intAccountId AND intUserId = @intUserId
END
```

`tblUserTokenDelete` has the same broad key:

```sql
DELETE FROM tblUserToken
WHERE intAccountId = @intAccountId AND intUserId = @intUserId
```

## Recommended Fix

Do not store MCP OAuth exchange session tokens in the shared legacy `tblUserToken` rowset unless all legacy update/delete procedures are made token-specific and MCP-safe.

Safer options:

1. Create a dedicated table for MCP session tokens, for example `tblMcpSessionToken`, and update gateway validation to check both legacy `tblUserToken` and MCP sessions.
2. Add a token-type/source column to `tblUserToken`, then update all legacy select/update/delete logic to filter by token/source and never overwrite `mcp_` rows.
3. Short-term mitigation: change `tblUserTokenUpdate` and `tblUserTokenDelete` to target the exact token value where possible. This is riskier because existing callers often only pass account/user and assume one token row.

Also consider logging the downstream response body in `DataMartClient` on 401 (without token values) so future incidents show `Invalid Token.` directly instead of only `401 Unauthorized`.

## Resolution -- Option 4 shipped (2026-07-06)

Shipped **Option 4: reactive 401 retry with token re-exchange** as a short-term MCP-only mitigation.

### What was done

- `src/auth/token-refresh.ts`: callback factory with promise coalescing -- when a downstream 401 occurs, re-exchanges the OAuth bearer token for a fresh `mcp_` session token and updates `authHeaders` in place.
- `src/clients/datamart-client.ts` and `src/clients/rest-client.ts`: on 401, call `onUnauthorized` callback then retry the request once. Non-401 errors are not retried.
- `src/server.ts`: wired the callback into OAuth sessions. A `TokenState` object tracks both the OAuth bearer token (updated per request) and the session token expiry. The callback uses the freshest available OAuth token for re-exchange.
- Tests: 19 new unit tests across `token-refresh.test.ts`, `datamart-client.test.ts`, and `rest-client.test.ts`.

### Why Option 1 is still necessary

Option 4 mitigates but does not fix the root cause. Legacy SPs still overwrite MCP token rows on every browser login/refresh. Each retry costs ~100-200ms and inserts another `mcp_` row that will be overwritten again. If the user is actively browsing, the cycle repeats on every tool call. A dedicated `tblMcpSessionToken` table (Option 1) would permanently eliminate the conflict but requires coordinated changes across ITM.Account, ITM.Web/ITM.API, and a schema migration.

