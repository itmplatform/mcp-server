# OAuth Login Company Selection

> **Status:** Ready for implementation
> **Date:** 2026-05-29
> **Primary repo:** ITM.Web
> **Related:** [ITM.Web OAuth Login & Consent](../../ITM.Web/zz_Specifications/done/SPEC_OAUTH_LOGIN_CONSENT.md), [older proposal](../../ITM.Web/zz_Specifications/SPEC_OAUTH_SINGLE_COMPANY_LOGIN.md), [ITM.Account OAuth Authorization Server](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_OAUTH_AUTHORIZATION_SERVER.md), [UI-E2E companion spec](../../ITM.UI-E2E-Testing/zz_Specifications/SPEC_E2E_OAUTH_COMPANY_SELECTION.md)

---

## 1. Goal

Remove the company slug text field from the OAuth login flow.

After the user enters their ITM credentials, OAuth must resolve the company context server-side:

1. If the credentials are valid for exactly one company, continue directly to OAuth consent.
2. If the credentials are valid for more than one company, ask the user which company to sign in to before showing consent.
3. If the credentials are not valid for any company, show the same generic invalid-login message used today.

The selected company must be fixed before consent and before ITM.Account issues the authorization code. Do not issue a token for the first company and rely on a later "switch company" behavior.

---

## 2. Search Record

Searches run before writing this spec:

| Search terms | Result |
|---|---|
| `oauth OAuth company slug slug company tenant account` in ITM.MCP | OAuth mode has no `ITM_COMPANY`; hosted URL supports `/v2/_/mcp`; token exchange supplies `company` after login. |
| `OAuthLogin OAuthFlowService OAuthHttpClient Authenticate company` in ITM.Web | Current OAuth login renders `txtCompany`, requires it, and calls `ITM.API/{company}/login/{email}/{password}`. |
| `SelectCompaniesByUserName SelectCompaniesByUserNameAndPassword tblAccountSelectByUserName` in ITM.Web | Main login uses username-only company lookup; Slack registration uses password-aware company lookup. |
| `UserCompanyList Login.aspx RegisterSlackUser CompanyListForSlack` in ITM.Web | Prior art exists for auto-selecting one company and prompting when multiple companies match. |
| `user-resolver needs-company-selection /switch SuperAdmin userdetails` in ITM.MSTeamBot | Teams bot resolves by trusted Teams email, uses SuperAdmin lookup, remembers selected company, and supports `/switch`; this is not the OAuth model. |
| `oauth/authorize exchange-token company OAuthApprovalRequest` in ITM.Account | ITM.Account stores an optional company hint, but the authorization code uses the approved company sent by ITM.Web. |

---

## 3. Current Facts

### 3.1 ITM.MCP

- OAuth HTTP mode does not use `ITM_COMPANY`. `ITM_COMPANY` is only required for stdio/API-key mode in [ITM.MCP README](../README.md).
- `src/gateway.ts` strips any `/v2/{slug}/mcp` prefix and treats `/v2/_/mcp` as valid. Tests explicitly call `_` the hosted URL convention.
- `src/auth/oauth-metadata.ts` advertises the MCP resource from `MCP_SERVER_URL`; it does not encode or require a company slug.
- `src/auth/oauth-auth.ts` builds `EffectiveUserContext.company` from ITM.Account's token exchange response. No ITM.MCP code should need to choose a company.

### 3.2 ITM.Account

- `OAuthController.Authorize()` reads optional `company` from the authorize query string and stores it in the pending authorization request.
- `OAuthController.Authorize()` redirects to `ITM.Web/{company}/Account/OAuthLogin.aspx` only when that optional company is present.
- `OAuthManager.ApproveAuthorization()` creates the authorization code using `approval.Company`, not the pending request's company hint.
- `OAuthTokenService.CreateAccessToken()` writes `company` into the JWT claim, and `TokenExchangeController.ExchangeToken()` returns that same company in the MCP exchange response.

Conclusion: ITM.Web can safely select the final company at login time. The optional authorize `company` value is only a hint and must not force a user-entered slug field.

### 3.3 Current OAuth Login in ITM.Web

- `Account/OAuthLogin.aspx` renders a `txtCompany` text box.
- `Account/OAuthLogin.aspx.cs` pre-fills that field when request info has `Company`, and otherwise leaves it editable.
- `BtnSignIn_Click()` rejects empty company/email/password.
- `OAuthFlowService.Authenticate(company, email, password)` rejects empty company and delegates to `OAuthHttpClient.Authenticate(...)`.
- `OAuthHttpClient.Authenticate(...)` calls:

```text
GET {APIURL}/{company}/login/{email}/{password}
```

That endpoint cannot validate credentials without a company slug.

### 3.4 Existing ITM.Web Prior Art

`Login.aspx.cs` resolves companies before normal platform login:

- `TblAccount.SelectCompaniesByUserName(txtUserName.Text.Trim())`
- one row: set `clsProjectSession.AccountID` and `clsProjectSession.CompanyId`, then continue login
- multiple rows: store `strTempUserName` and encrypted `strTempPassword` in `Session`, then redirect to `UserCompanyList.aspx`
- `UserCompanyList.aspx.cs` lets the user select a company and then completes login

There is also password-aware prior art used by Slack registration:

- `RegisterSlackUser.aspx.cs` calls `TblAccount.SelectCompaniesByUserNameAndPassword(txtUserName.Text.Trim(), SiteUtility.EncryptData(txtPassword.Text.Trim()))`
- one row: continue immediately
- multiple rows: store temporary credentials in `Session` and open `Slack/CompanyListForSlack.aspx`
- `CompanyListForSlack.aspx.cs` binds the matching companies and lets the user choose

For OAuth, use the password-aware lookup. It preserves the ITM.Web company-resolution behavior while avoiding showing company choices for a wrong password.

### 3.5 ITM.MSTeamBot Is Not the Model for OAuth

`ITM.MSTeamBot/src/itm-client.ts` resolves users through:

```text
GET /SuperAdmin/userdetails/{email}/?superadminuser=...&Password=...
GET /{CompanyURL}/login/{email}/{password}
```

`ITM.MSTeamBot/src/user-resolver.ts` works from a Microsoft-authenticated email, keeps an in-memory company choice by `aadObjectId`, and `src/bot.ts` supports `/switch`.

OAuth is different:

- The user is actively entering ITM credentials in ITM.Web.
- There is no need for SuperAdmin lookup or Teams identity bridging.
- The company choice must happen inside the authorization flow, before consent and before token issuance.
- Do not remember a company choice as a global preference for future OAuth attempts.

---

## 4. Required Behavior

### 4.1 Initial Login Page

`OAuthLogin.aspx` must show:

- client name
- email field
- password field
- sign-in button
- cancel link

It must not show a free-text company slug field. The optional authorize `company` hint may be kept in hidden/server-side state, but the user must not be asked to type it.

### 4.2 Login Submit

On sign-in:

1. Validate email and password are non-empty.
2. Resolve companies for the entered credentials using `TblAccount.SelectCompaniesByUserNameAndPassword(email.Trim(), SiteUtility.EncryptData(password.Trim()))`.
3. If no rows are returned, show a generic invalid-login error and do not reveal whether the email exists.
4. If exactly one row is returned, use that company slug and call the existing API login path through `OAuthHttpClient.Authenticate(company, email, password)`.
5. If more than one row is returned, render a company picker on the same OAuth page and do not authenticate to a specific company yet.

The company count is the number of companies for which the entered credentials are valid, not merely the number of companies attached to the email.

### 4.3 Multi-Company Picker

The picker must:

- list every matching company returned by the password-aware lookup
- identify each row by server-trusted `accountId` or an opaque server-generated selection key
- display company name and, if already available from the DataSet, the company slug as supporting text
- include no free-text company input
- keep the OAuth `request_id` intact

When the user selects a company:

1. Load the pending OAuth login state from ASP.NET Session.
2. Verify the selected company exists in that server-side pending list.
3. Resolve the company slug from the server-side pending list, not from posted text.
4. Complete authentication for that company.
5. Clear the pending multi-company state.
6. Store the normal OAuth session values and redirect to consent.

### 4.4 Session State

The multi-company step may store temporary data in ASP.NET Session, following existing `UserCompanyList` and Slack patterns.

Required pending state:

```text
oauth_pending_request_id
oauth_pending_email
oauth_pending_encrypted_password
oauth_pending_companies
```

Rules:

- Store only the encrypted password from `SiteUtility.EncryptData(...)`, never the plaintext password.
- Do not put the password, encrypted or plaintext, in ViewState, hidden fields, query strings, logs, or JavaScript.
- Clear pending state on successful login, cancel, invalid request, expired request, and invalid selection.
- If pending state is missing when a company is selected, show the generic invalid-login/error state and require the user to start the sign-in step again.

If the existing API login path still needs plaintext password after company selection, decrypt the session-stored encrypted password server-side only for that one call, then clear the pending state immediately after the call.

### 4.5 Optional Company Hint

The optional company stored on the OAuth request is a hint, not a user-entered slug.

Rules:

- Do not render it as an editable company field.
- Do not auto-select it when the entered credentials match multiple companies.
- If credentials match one company, use the one matching company even if the hint is empty.
- If credentials match multiple companies, ask the user to choose.
- If the user chooses a company different from the hint, use the user's explicit choice in the approval payload.

This keeps the behavior consistent for generic hosted URLs such as `/v2/_/mcp` and for older authorize URLs that still include `company`.

### 4.6 Consent and Token Issuance

After a successful single-company login or explicit multi-company selection, keep the current OAuth flow:

```text
Session["oauth_token"] = loginResult.Token
Session["oauth_userId"] = loginResult.UserId
Session["oauth_accountId"] = loginResult.AccountId
Session["oauth_company"] = selectedCompanySlug
Session["oauth_email"] = email
Redirect to OAuthConsent.aspx?request_id={request_id}
```

`OAuthConsent.aspx` should continue sending `userId`, `accountId`, and selected `company` to ITM.Account `/oauth/approve`.

---

## 5. Implementation TODO

### ITM.Web

- [ ] Remove the visible `txtCompany` field from `Account/OAuthLogin.aspx`.
- [ ] Add company-picker markup to `Account/OAuthLogin.aspx`; keep it hidden until multiple valid companies are found.
- [ ] Update `Account/OAuthLogin.aspx.cs` so `Page_Load` no longer pre-fills a company text box.
- [ ] Add a password-aware company resolver to the OAuth App_Code service layer.
- [ ] Keep `IOAuthHttpClient` for existing `/oauth/request`, `/oauth/approve`, and `/{company}/login` calls.
- [ ] Add an injectable resolver boundary so `OAuthFlowService` unit tests do not hit the database.
- [ ] Update `BtnSignIn_Click()` to call the resolver before `Authenticate(...)`.
- [ ] Add a company-selection postback handler.
- [ ] Store pending multi-company state only in server-side Session.
- [ ] Validate selected company against the pending server-side list.
- [ ] Clear pending state on success, cancel, errors, and expired requests.
- [ ] Keep all user-facing credential failures generic.

### ITM.Account

- [ ] No endpoint change is required.
- [ ] Confirm approval still accepts a selected company that differs from the optional request hint.
- [ ] Add or adjust unit tests only if an existing test assumes the request hint must equal the approval company.

### ITM.MCP

- [ ] No code change is expected.
- [ ] Confirm docs still point hosted OAuth clients at the generic MCP URL, for example `/v2/_/mcp`, and do not tell users to enter a company slug during OAuth.

### UI-E2E-Testing

- [ ] Update OAuth E2E specs that currently expect a company input.
- [ ] Implement the companion E2E plan in [SPEC_E2E_OAUTH_COMPANY_SELECTION.md](../../ITM.UI-E2E-Testing/zz_Specifications/SPEC_E2E_OAUTH_COMPANY_SELECTION.md).
- [ ] Add/seed a test user with valid credentials in exactly one company.
- [ ] Add/seed a test user with valid credentials in at least two companies.

---

## 6. Test Plan

### 6.1 ITM.Web Unit Tests

Add tests around the OAuth service/page logic:

| Scenario | Expected |
|---|---|
| empty email | resolver/authenticate not called; generic validation error |
| empty password | resolver/authenticate not called; generic validation error |
| invalid credentials | no company picker; generic invalid-login error |
| one valid company | authenticates with that company and redirects to consent |
| multiple valid companies | does not authenticate; renders picker |
| selected company belongs to pending list | authenticates selected company and redirects to consent |
| selected company is tampered/unknown | no authenticate call; generic error |
| pending state missing on selection | no authenticate call; user must restart login step |
| cancel after picker | calls deny approval, clears pending state |
| request has company hint but credentials match multiple companies | picker is shown; no auto-select |

### 6.2 ITM.Account Unit Tests

Add a focused test only if needed:

| Scenario | Expected |
|---|---|
| approval company differs from request hint | authorization code and later token exchange use approval company |

### 6.3 Browser E2E Tests

Update `ITM.UI-E2E-Testing/playwright/tests/oauth/oauth-flow.spec.ts`:

- login page renders no company input
- single-company user reaches consent without typing a company
- multi-company user sees a company picker after entering credentials
- multi-company user reaches consent only after selecting a company
- token exchange response contains the selected company
- invalid credentials do not reveal or render company choices
- tampered company selection does not reach consent

Because this is user-facing OAuth behavior, implementation must also be verified with Playwright MCP. Save screenshots/snapshots under the relevant repo's `.playwright-mcp/` folder only.

---

## 7. Acceptance Criteria

1. OAuth login never asks the user to type a company slug.
2. A single-company user reaches consent after entering only email and password.
3. A multi-company user must explicitly choose a company before consent.
4. No authorization code, access token, refresh token, or MCP session token is issued before the company is selected.
5. The selected company is the company in the OAuth authorization code, JWT `company` claim, token exchange response, and ITM.MCP `EffectiveUserContext`.
6. Invalid credentials show a generic error and no company list.
7. Existing OAuth approve, deny, cancel, refresh-token, and MCP token exchange flows still pass.
8. Unit tests, integration tests if touched, and OAuth E2E tests pass.

---

## 8. Non-Goals

- Do not add a public email-to-company lookup endpoint.
- Do not use the ITM.MSTeamBot SuperAdmin `userdetails` endpoint.
- Do not remember a selected company across independent OAuth authorization attempts.
- Do not add a `/switch` concept to OAuth.
- Do not change the current OAuth scope model.
- Do not expand SSO support beyond what the current OAuth login page already supports.

---

## 9. Notes for Implementers

- The older ITM.Web proposal left open whether `tblAccountSelectByUserName` works for this use case. Prefer `SelectCompaniesByUserNameAndPassword` for OAuth because it is already used by Slack registration and filters by credentials before rendering company choices.
- Keep the implementation in ITM.Web unless a later requirement demands a reusable internal API. This avoids adding a new public API surface and matches WebForms prior art.
- `OAuthHttpClient.Authenticate(...)` still sends credentials to the legacy login endpoint. This spec does not fix that existing password-in-URL debt; it only removes the company slug prompt.
- If implementation discovers that `SelectCompaniesByUserNameAndPassword` does not return `strApplicationName`, use `intAccountId` from the returned row and load the account with the existing account DataAccess method before authenticating.
