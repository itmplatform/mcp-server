# OAuth Consent Scope Checkboxes (moved)

> **Status:** Moved to ITM.Account on 2026-07-17
> **Spec:** [ITM.Account/ITM.Account/zz_Specifications/SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md](../../ITM.Account/ITM.Account/zz_Specifications/SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md)

The full specification lives in ITM.Account because the authoritative change (granted-scope validation and the authorization-code write in `OAuthManager.ApproveAuthorization`) belongs to that repo. ITM.Web carries the consent-page checkbox UI; ITM.MCP needs no code change.

Summary: the OAuth consent page renders one checkbox per requested scope. `mcp:read` is checked and disabled (required); `mcp:write` is checked by default and can be unticked, producing a read-only grant (`mcp:read`) that flows through the code, JWT, refresh chain, and MCP session (20 tools instead of 30). The approve payload gains an optional `grantedScope` field, validated server-side in ITM.Account as a subset of the requested scope.

ITM.MCP follow-up when implemented: note in `APIDocs` setup-oauth (en/es) that write access can be declined on the consent screen and re-granted by re-authorizing.
