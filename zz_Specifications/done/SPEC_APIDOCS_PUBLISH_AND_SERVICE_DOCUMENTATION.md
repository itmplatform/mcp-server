# Spec: Publish MCP APIDocs and restore service_documentation

## Context

The OAuth authorization server metadata (`/.well-known/oauth-authorization-server`)
previously included a `service_documentation` field pointing to
`{issuer}/docs/oauth`. That URL was never served -- no controller or static
content existed at that path. The field has been removed to avoid advertising
a broken link.

ITM.Datamart already publishes its APIDocs to
`https://developers.itmplatform.com/datamart/` via its CI/CD pipeline. ITM.MCP
has a complete APIDocs site in `ITM.MCP/APIDocs/` but it is not yet published.

## Goal

1. Publish the MCP APIDocs to `https://developers.itmplatform.com/mcp/`.
2. Add `service_documentation` back to the OAuth server metadata once the docs
   are live, pointing to the published URL.
3. Review and update the APIDocs content to reflect the current implementation.

## 1. Pipeline: publish APIDocs

Follow the same pattern as ITM.Datamart's pipeline:

- Build the APIDocs static site (`npm run build` in `ITM.MCP/APIDocs/`).
- Deploy the output to `developers.itmplatform.com/mcp/`.
- Trigger on merges to main/stage that touch `APIDocs/`.

## 2. Restore service_documentation in OAuth metadata

Once the docs are live at a stable URL, add the field back in
`ITM.Account/Controllers/OAuthController.cs`:

```csharp
ServiceDocumentation = "https://developers.itmplatform.com/mcp/"
```

Re-add the property to `OAuthServerMetadata.cs`:

```csharp
[JsonProperty("service_documentation")]
public string ServiceDocumentation { get; set; }
```

Use a hardcoded URL (not `issuer + "/docs/oauth"`) since the docs are hosted
on a different domain than the API.

## 3. APIDocs content review

The docs were written before several implementation changes. Review and update
the following:

### OAuth section (`setup-oauth.md`, `authentication.md`)

- The server URL example uses `https://mcp.itmplatform.com/mcp` -- update to
  the actual gateway URL pattern: `https://api.itmplatform.com/v2/_/mcp/`
  (and environment-specific variants).
- The OAuth flow diagram in `authentication.md` references `GET /authorize`
  and `GET /.well-known/` on the MCP server itself. In practice, the
  authorization server is ITM.Account (separate origin), and discovery starts
  with the MCP protected resource metadata, not the authorization server
  metadata directly. Update the diagram to match the actual three-step
  discovery: POST to MCP -> 401 with `resource_metadata` ->
  `/.well-known/oauth-protected-resource` -> `authorization_servers` ->
  `/.well-known/oauth-authorization-server`.
- Document the `resource` parameter requirement in the authorization request
  (RFC 8707). AI clients must include it for the authorization to succeed.

### Self-hosting section (`self-hosting.md`)

- Verify that the environment variable table matches the current `.env.sample`.
- `ITM_AUTH_PUBLIC_URL` was recently added -- ensure it is documented.
- Review the HTTP+OAuth example to match the current startup flow.

### General

- Check all endpoint URLs and configuration examples against the current
  implementation.
- Verify the tools reference matches the current tool set.
- Ensure the `llms.txt` and `llms-full.txt` files (if present) are up to date.
- Add a section on the gateway routing if it is not already covered: AI clients
  connect via the public gateway URL, and the gateway handles request/response
  relay transparently.

## Verification

- `developers.itmplatform.com/mcp/` loads and renders the APIDocs site.
- OAuth server metadata includes `service_documentation` pointing to the live
  URL.
- A manual walkthrough of the docs matches the actual setup experience for a
  new user connecting an AI client (Claude Desktop, Cursor) to the hosted MCP.
