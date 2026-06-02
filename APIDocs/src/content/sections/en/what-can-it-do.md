ITM Platform's MCP server connects your project management data to AI agents. MCP (Model Context Protocol) is an open standard that lets AI tools talk to external services. Once connected, an AI agent can read your portfolio, analyze data across projects, take action, and even run unattended on a schedule -- turning ITM Platform into automatable infrastructure.

It works with Claude, GitHub Copilot, Cursor, Codex, Windsurf, JetBrains, and any other client that supports MCP. You choose the AI; the MCP server handles the bridge to ITM Platform.

### What can an agent do?

From simple lookups to fully automated cross-system workflows, MCP unlocks progressively more powerful use cases.

#### Quick lookup

> **You:** "What risks are open across my portfolio?"
>
> The agent aggregates risks from all your projects and highlights the highest-impact ones.

#### Multi-step analysis

> **You:** "Review every project ending this quarter. Flag any with budget overruns, open high-impact risks, or task completion below 60%."
>
> The agent searches your projects, filters by end date, then fetches budget, risks, and tasks for each one. It cross-references the data and delivers a single prioritized report with the projects that need attention.

#### Automated bulk actions

> **You:** "For every project still in Planning status with a start date in the past, update the status to Execution and create a kick-off checklist task assigned to the project manager."
>
> The agent searches for matching projects, confirms which ones qualify, updates each project's status, and creates a task in each one. It reports back with what it changed.

#### Scheduled intelligence

> **Every Monday morning**, an agent pulls all projects with overdue tasks, calculates how many days each task is slipping, groups them by project manager, and posts a summary to the #pmo-alerts Slack channel.
>
> No one types a prompt. The agent runs on a schedule, reads ITM Platform through MCP, and pushes results where the team already works.

#### Cross-system orchestration

> When a developer merges a pull request on GitHub, an agent finds the matching task in ITM Platform by branch name, marks it complete, updates the project's progress, and -- if the project just hit 100% task completion -- drafts a closure summary and sends it to the program manager via email.
>
> Three systems (GitHub, ITM Platform, email) orchestrated by one agent with no human in the loop.
