### Disconnecting your AI client

To stop your AI client from accessing ITM Platform, remove the MCP server from the client's configuration:

**Claude Code:** Run `claude mcp remove itm-platform`.

**OpenAI Codex:** Run `codex mcp remove itm-platform`.

**Claude Desktop:** Go to **Settings > Connectors**, find the ITM Platform entry, and remove it.

**VS Code:** Delete the `itm-platform` entry from `.vscode/mcp.json`.

**Cursor:** Delete the `itm-platform` entry from `.cursor/mcp.json`.

**Other clients:** Remove the ITM Platform server from your client's MCP configuration file or settings.

If you used an API key and want to invalidate it, go to **My Profile** in ITM Platform and regenerate the key. The old key stops working immediately.
