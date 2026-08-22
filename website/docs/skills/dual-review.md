---
sidebar_position: 2
---

# dual-review

A Claude Code slash command that sends your plan or diff to a second AI agent for independent,
structured review before and after you implement.

## What it does

```
/dual-review Implement feature X
```

1. **Explore** the codebase to understand the area being changed
2. **Plan** a draft implementation
3. **Pre-review** — send the plan to the `review` tool on the `claude_reviewer` (or `codex`) MCP
   server for a structured verdict
4. **Iterate** — on `NEEDS_REVISION`, address critical/major issues and re-submit, up to 3 rounds
5. **Implement** once the plan is `APPROVED`
6. **Post-review** — send the final `git diff` to `code_review` for a post-implementation check
7. **Summarize** with the full review history

The reviewer runs in a separate agent instance with read-only codebase access and returns:

```json
{
  "verdict": "APPROVED | NEEDS_REVISION",
  "issues": [
    { "severity": "critical | major | minor", "description": "...", "recommendation": "..." }
  ],
  "suggestions": ["..."]
}
```

**Iteration rules:** critical issues must be addressed before re-submitting; major issues should
be; minor issues are at your discretion. After 3 `NEEDS_REVISION` rounds, the issues are presented
to you for a decision instead of looping forever.

## Why it exists

`dual-review` isn't a bolted-on extra — it's the workflow the MCP bridge itself was built to
enable. The bridge's original design doc (`SPEC.md`) describes exactly this loop: give a second AI
a plan or diff via the `claude_reviewer`/`codex` MCP tools, before and after implementing, so a
review round doesn't mean manually copy-pasting a diff into another agent's chat window.

For most of the project's life it lived only as `skills/dual-review/SKILL.md` — usable if you had
this repo cloned, but not installable on its own. That changed 8 days into the project's public
life, via three commits that turned it into a real distributable skill:

- **`3c12bac`** — scaffolded multi-channel skill distribution infrastructure (pnpm workspace,
  package generation, marketplace generation, a `skills-release` Changesets pipeline) for the repo
  as a whole. At this point `dual-review` still had no `metadata.json`, so package generation was
  blocked for it specifically.
- **`0aac0a7`** — authored `dual-review`'s missing `metadata.json`, unblocking package generation.
  Fully generated, synced, and validated — but still `private: true`, nothing published yet.
- **`bf7279b`** — flipped it to `private: false` and enabled it for npm publish.

The result: `@mcp-agent-bridge/skill-dual-review` is now a real, independently versioned package
(currently `1.0.0` on npm) and a plugin in this repo's own Claude Code marketplace, installable
without cloning the bridge itself.

## Install

<details>
<summary><b>Claude Code Plugin</b></summary>

```shell
/plugin marketplace add catesandrew/mcp-agent-bridge
/plugin install mab@mcp-agent-bridge
```

</details>

<details>
<summary><b>npm package</b></summary>

The skill is published as [`@mcp-agent-bridge/skill-dual-review`](https://www.npmjs.com/package/@mcp-agent-bridge/skill-dual-review).
Inspect or fetch it directly:

```shell
npm view @mcp-agent-bridge/skill-dual-review
```

Its `SKILL.md`, `metadata.json`, `LICENSE`, and `README.md` are the package contents — copy
`SKILL.md` into your agent's skills directory if your tooling consumes skill files directly rather
than through a plugin manager.

</details>

<details>
<summary><b>Manual / clone</b></summary>

```shell
git clone https://github.com/catesandrew/mcp-agent-bridge.git
cp -r mcp-agent-bridge/skills/dual-review ~/.claude/skills/dual-review
```

</details>

## Configuration

The skill needs the `claude_reviewer` MCP server (this repo's Claude bridge) reachable. Default:
`http://localhost:8940/mcp`, configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "streamable-http",
      "url": "http://localhost:8940/mcp"
    }
  }
}
```

Environment variables (inherited from the bridge server):

- `CLAUDE_REVIEW_MODEL` — model used by the reviewer (default: `opus`)
- `CLAUDE_REVIEW_MAX_TURNS` — max agentic turns per review (default: `8`)
- `CLAUDE_REVIEW_CWD` — working directory for the reviewer's file access
- `CLAUDE_REVIEW_ALLOWED_TOOLS` — comma-separated tools the reviewer can use
