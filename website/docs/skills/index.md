---
sidebar_position: 1
---

# Skills Catalog

MCP Agent Bridge ships **Claude Code skills** — slash-command workflows distributed as
Claude Code plugins and standalone npm packages — separately from the bridge's MCP tools
(the [resume & career tools](../guides/resume-tools) are MCP tools, not skills; see
[SKILLS.md](https://github.com/catesandrew/mcp-agent-bridge/blob/main/SKILLS.md) for those).

| Skill | What it's for | Use case |
|-------|----------------|----------|
| [`dual-review`](./dual-review) | Sends a plan or diff to a second AI agent (via the bridge's `claude_reviewer` or `codex` MCP server) for independent structured review, iterating on feedback before you implement | You want a second opinion baked into your workflow instead of manually copy-pasting diffs between agent tabs |

## How skills here are distributed

Every skill in this repo ships through two channels, wired up by the same infrastructure:

- **Claude Code plugin marketplace** — this repo is itself a marketplace
  (`.claude-plugin/marketplace.json`, prefix `mab`). Install with:
  ```shell
  /plugin marketplace add catesandrew/mcp-agent-bridge
  /plugin install mab@mcp-agent-bridge
  ```
- **Standalone npm package** — each skill also publishes as `@mcp-agent-bridge/skill-<name>`
  (e.g. [`@mcp-agent-bridge/skill-dual-review`](https://www.npmjs.com/package/@mcp-agent-bridge/skill-dual-review))
  for agents or tooling that consume a `SKILL.md` directly rather than through a plugin
  marketplace.

Both channels are generated and validated from the same source (`skills/<name>/SKILL.md`) by
`bin/generate-skill-package-json.mjs`, `bin/sync-skill-content.mjs`, `bin/validate-skill-package.mjs`,
and `bin/generate-marketplace.mjs`, gated by `.github/workflows/skills-release.yml` and released via
Changesets. A skill only publishes to npm once it's listed in `docs/published-skills.json`.

Adding a new skill means adding a `skills/<name>/SKILL.md`, letting that pipeline generate its
package, and adding a page here.
