# PR Tools Parity — Design Spec

**Date:** 2026-06-12
**Status:** Approved

---

## Problem

Four PR workflow skills exist as Claude Code slash commands in `~/.claude/skills/`:

- `pr-gh-open` — push branch and open a GitHub PR
- `pr-gh-code-review` — systematic file-by-file GitHub PR review with inline comments
- `pr-ado-open` — push branch and open an Azure DevOps PR
- `pr-ado-code-review` — systematic ADO PR review with inline thread comments

These skills are only accessible to Claude Code. The Codex and Copilot bridge servers have no equivalent. Additionally, the `review` tool (run `git diff`, return structured `ReviewResult`) exists only in `src/claude/server.ts`.

**Goal:** make all five capabilities available across all three platforms (Claude, Codex, Copilot) via the MCP bridge.

---

## Approach

Follow the shared-skill file pattern used by the 18 resume/career tools, with one important difference in handler behavior:

- One file per tool in `src/shared/`, each exporting a `buildXxxPrompt()` function
- The function takes the tool's input args and returns a **rendered string** — the verbatim skill markdown with `${input:*}` placeholders replaced by actual values
- The `server.ts` handler returns this string **directly as the tool result** — it does **not** call `runClaude()` / `runCodex()` / `runCopilot()`
- The calling agent reads the rendered instructions and executes the bash workflow using its own shell access (`gh`, `az`, `git`)

This differs from resume tools (which build a prompt → feed it to the platform AI → return AI-generated content). PR tools return a workflow recipe; the agent is the executor, not the bridge.

The `review` parity uses the existing `code_review` inline spawning pattern already in `src/codex/server.ts` and `src/copilot/server.ts`.

---

## File Structure

### New files

```
src/shared/pr-gh-open-skill.ts        # buildOpenPrGhPrompt()
src/shared/pr-gh-review-skill.ts      # buildReviewPrGhPrompt()
src/shared/pr-ado-open-skill.ts       # buildOpenPrAdoPrompt()
src/shared/pr-ado-review-skill.ts     # buildReviewPrAdoPrompt()
```

### Modified files

```
src/claude/server.ts     # register 4 new PR tools (review already exists)
src/codex/server.ts      # register 4 new PR tools + add review tool
src/copilot/server.ts    # register 4 new PR tools + add review tool
src/shared/index.ts      # export 4 new builders
```

No changes to `src/shared/types.ts`, `server-factory.ts`, or `claude-runner.ts`.

---

## Tool Schemas

### `open_pr_gh`
Source: `src/shared/pr-gh-open-skill.ts`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `baseBranch` | string | no | `"dev"` | Target branch to merge into |
| `jiraBaseUrl` | string | no | — | Issue tracker base URL for ticket links |
| `reviewers` | string | no | — | Comma-separated GitHub usernames |
| `labels` | string | no | — | Comma-separated PR labels |
| `draft` | boolean | no | `false` | Open as draft PR |

### `review_pr_gh`
Source: `src/shared/pr-gh-review-skill.ts`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pr` | string | yes | — | PR URL or number |
| `repo` | string | no | — | `owner/repo` slug (inferred from URL if omitted) |

### `open_pr_ado`
Source: `src/shared/pr-ado-open-skill.ts`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `org` | string | yes | — | ADO organization URL |
| `project` | string | yes | — | ADO project name |
| `repo` | string | yes | — | Repository name |
| `baseBranch` | string | no | `"dev"` | Target branch |
| `jiraBaseUrl` | string | no | — | Issue tracker base URL |
| `reviewers` | string | no | — | Space-separated reviewer emails |
| `workItems` | string | no | — | Space-separated ADO work item IDs |
| `draft` | boolean | no | `false` | Open as draft PR |
| `autoComplete` | boolean | no | `false` | Enable auto-complete on creation |

### `review_pr_ado`
Source: `src/shared/pr-ado-review-skill.ts`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prId` | string | yes | — | ADO pull request ID |
| `org` | string | yes | — | ADO organization URL |
| `project` | string | yes | — | ADO project name |
| `repo` | string | yes | — | Repository name |

### `review` (Codex + Copilot parity)
Inline in `src/codex/server.ts` and `src/copilot/server.ts`. Same input schema as Claude's existing `review` tool. Spawns the platform CLI with a structured review prompt + `REVIEW_JSON_SCHEMA` constraint and returns a parsed `ReviewResult`.

---

## Data Flow

### PR skill tools (open_pr_gh, review_pr_gh, open_pr_ado, review_pr_ado)

```
Agent calls tool with params
  → server.ts handler calls buildXxxPrompt(inputs)
  → skill file replaces ${input:*} placeholders with actual values
    in the verbatim skill markdown string
  → handler returns rendered string directly as { content: [{ type: "text", text }] }
    (no subprocess, no platform AI spawned)
  → calling agent reads the instructions and executes the bash workflow
    (gh / az / git commands run in the agent's own shell)
```

### review tool (Codex + Copilot)

```
Agent calls review with code/diff input
  → server.ts handler spawns platform CLI
     (codex exec --skip-git-repo-check / copilot -p)
     with structured review prompt + REVIEW_JSON_SCHEMA
  → platform AI generates review
  → handler parses JSON response
  → returns ReviewResult { verdict, issues, suggestions }
```

---

## Error Handling

- PR skill tools return the rendered markdown string; any execution errors surface through the calling agent's bash tool (no additional error handling needed in the bridge)
- `review` parity: follow the existing `code_review` fallback pattern in each server — if JSON parsing fails, return raw text rather than throwing

---

## Testing

- Unit tests for each `buildXxxPrompt()` function: verify input substitution replaces all `${input:*}` placeholders correctly and that required/optional fields behave as specified
- Integration: verify all 4 new tools appear in each server's tool list via MCP `tools/list`
- Manual: invoke `open_pr_gh` and `review_pr_gh` from each platform and confirm the returned instructions match the source skill content
