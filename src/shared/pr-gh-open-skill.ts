/**
 * Hard-coded pr-gh-open skill.
 *
 * Source: ~/.claude/skills/pr-gh-open/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 *
 * Escaping rules applied when embedding in the template literal:
 *   - Triple backticks (```) → \`\`\`
 *   - ${input:varName} placeholders → \${input:varName}  (preserved as literal text for .replaceAll())
 */
export const PR_GH_OPEN_SKILL = `
---
name: pr-gh-open
description: Use when the user says "open a PR", "create a pull request", or "submit a PR" against a GitHub repository and needs the branch pushed and PR created with a structured description, linked ticket, reviewers, and labels.
---

# Open PR (GitHub)

Push the active branch and open a GitHub pull request with a structured description, linked ticket, reviewers, and labels in one pass.

## Inputs

| Variable | Description | Example |
|----------|-------------|---------|
| \`\${input:baseBranch}\` | Target branch (default: \`dev\`) | \`dev\` |
| \`\${input:jiraBaseUrl}\` | Issue tracker base URL (optional) | \`https://jira.example.com/browse\` |
| \`\${input:reviewers}\` | Comma-separated GitHub usernames (optional) | \`alice,bob\` |
| \`\${input:labels}\` | Comma-separated labels to apply (optional) | \`feature,needs-review\` |
| \`\${input:draft}\` | Open as draft PR — \`true\` or \`false\` (default: \`false\`) | \`true\` |

---

## Phase 1: Pre-flight Checks

### 1.1 Verify working tree is clean
\`\`\`bash
git status --short
\`\`\`
If uncommitted changes exist, describe them and ask the user whether to stash, commit, or abort.

### 1.2 Identify the active branch
\`\`\`bash
git branch --show-current
\`\`\`

### 1.3 Confirm the base branch
Default to \`\${input:baseBranch}\`. If not provided, detect from repo conventions:
\`\`\`bash
# Check for common integration branches in priority order
git branch -r | grep -E 'origin/(dev|develop|main|master)$' | head -5
\`\`\`
Always confirm with the user before proceeding — merging into the wrong branch can trigger unintended CI or deployment pipelines.

---

## Phase 2: Ticket and Commit Discovery

### 2.1 Extract ticket from branch name first
Branch naming conventions typically embed the ticket:
\`\`\`bash
git branch --show-current
# Patterns: feature/PROJ-123-slug, PROJ-123/slug, PROJ-123-slug
\`\`\`
Extract using: \`[A-Z]+-[0-9]+\`

### 2.2 Fall back to commit messages
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --oneline
\`\`\`
Search commit subjects for the same \`[A-Z]+-[0-9]+\` pattern.

### 2.3 Summarize commits for the Changes section
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --pretty=format:"%s" --no-merges
\`\`\`
Use these commit subjects as the raw material for the Changes bullets — rewrite them as human-readable descriptions, not raw commit messages.

---

## Phase 3: Push Branch

\`\`\`bash
git push -u origin $(git branch --show-current)
\`\`\`

If the push is rejected (non-fast-forward), investigate before force-pushing. Confirm with the user.

---

## Phase 4: Build PR Description

Use this template — populate every section from the commit log and diff:

\`\`\`markdown
### Ticket(s)

- [TICKET-xxx](\${input:jiraBaseUrl}/TICKET-xxx)

### Changes

- <specific change 1: what changed, in which component, and why>
- <specific change 2>

### Tests

- <TestClassName>: <what was added or changed>
- No tests added or modified. ← only if true

### Notes

<optional: migration steps, rollback notes, feature flag, known limitations>
\`\`\`

**Section rules:**
- **Ticket(s)**: omit if no tracker URL is configured
- **Changes**: 1–5 bullets, non-test changes only; never write "fixed bug" — name the component and behavior
- **Tests**: one bullet per test file added/modified with a brief description; explicitly state if no tests were touched
- **Notes**: include only if there are migration steps, a feature flag to toggle, deployment order requirements, or known limitations

---

## Phase 5: Create the PR

\`\`\`bash
gh pr create \\
  --base "\${input:baseBranch}" \\
  --title "[TICKET-xxx] <concise one-line summary>" \\
  --body "$(cat <<'EOF'
### Ticket(s)
...
EOF
)" \\
  --reviewer "\${input:reviewers}" \\
  --label "\${input:labels}" \\
  $([ "\${input:draft}" = "true" ] && echo "--draft")
\`\`\`

If \`\${input:reviewers}\` is not provided, check for a \`CODEOWNERS\` file:
\`\`\`bash
gh api repos/{owner}/{repo}/contents/CODEOWNERS --jq '.content' | base64 -d
\`\`\`
Suggest owners for the changed paths and ask the user to confirm before adding.

---

## Phase 6: Post-creation Steps

\`\`\`bash
# Print the PR URL
gh pr view --web 2>/dev/null || gh pr view --json url -q .url
\`\`\`

Optionally apply AI governance label if the session was AI-assisted:
\`\`\`bash
gh pr edit <number> --add-label "ai-assisted"
\`\`\`

---

## Common Mistakes

- **Wrong base branch** — Always confirm before pushing. \`dev\` vs \`main\` can trigger different deployment pipelines.
- **Pushing before confirming base** — Push after the base branch is confirmed, not before.
- **Vague Changes bullets** — "Fixed bug" and "Updated service" tell reviewers nothing. Name the component, the behavior that changed, and why.
- **Skipping the Notes section when it matters** — Migration steps, feature flags, and deployment ordering buried in Slack instead of the PR description cause incidents.
- **Forgetting draft mode for WIP branches** — If the branch is not ready for review, open as draft to prevent accidental merges.
- **Adding reviewers without checking CODEOWNERS** — Auto-assigning random teammates instead of the actual owners wastes everyone's time.
`.trim();

/**
 * Build a rendered pr-gh-open prompt by substituting all ${input:*} placeholders
 * with the caller-supplied values (or sensible defaults).
 */
export function buildOpenPrGhPrompt(args: {
  baseBranch?: string;
  jiraBaseUrl?: string;
  reviewers?: string;
  labels?: string;
  draft?: boolean;
}): string {
  return PR_GH_OPEN_SKILL
    .replaceAll("${input:baseBranch}", args.baseBranch ?? "dev")
    .replaceAll("${input:jiraBaseUrl}", args.jiraBaseUrl ?? "")
    .replaceAll("${input:reviewers}", args.reviewers ?? "")
    .replaceAll("${input:labels}", args.labels ?? "")
    .replaceAll("${input:draft}", String(args.draft ?? false));
}
