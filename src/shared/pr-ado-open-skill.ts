/**
 * Hard-coded pr-ado-open skill.
 *
 * Source: ~/.claude/skills/pr-ado-open/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 *
 * Escaping rules applied when embedding in the template literal:
 *   - Triple backticks (```) → \`\`\`
 *   - ${input:varName} placeholders → \${input:varName}  (preserved as literal text for .replaceAll())
 */
export const PR_ADO_OPEN_SKILL = `
---
name: pr-ado-open
description: Use when the user says "open a PR", "create a pull request", or "submit a PR" against an Azure DevOps repository and needs the branch pushed and PR created with a structured description, linked work items, reviewers, and auto-complete policy.
---

# Open PR (Azure DevOps)

Push the active branch and open an Azure DevOps pull request with a structured description, linked work items, reviewers, and optional auto-complete in one pass.

## Inputs

| Variable | Description | Example |
|----------|-------------|---------|
| \`\${input:org}\` | Azure DevOps organization URL | \`https://dev.azure.com/myorg\` |
| \`\${input:project}\` | ADO project name | \`MyProject\` |
| \`\${input:repo}\` | Repository name | \`my-service\` |
| \`\${input:baseBranch}\` | Target branch (default: \`dev\`) | \`dev\` |
| \`\${input:jiraBaseUrl}\` | Issue tracker base URL (optional) | \`https://jira.example.com/browse\` |
| \`\${input:reviewers}\` | Space-separated reviewer emails (optional) | \`alice@example.com bob@example.com\` |
| \`\${input:workItems}\` | Space-separated work item IDs to link (optional) | \`1234 5678\` |
| \`\${input:draft}\` | Open as draft PR — \`true\` or \`false\` (default: \`false\`) | \`true\` |
| \`\${input:autoComplete}\` | Set auto-complete on creation — \`true\` or \`false\` | \`false\` |

---

## Phase 1: Setup and Pre-flight

### 1.1 Configure defaults
\`\`\`bash
az devops configure --defaults organization=\${input:org} project=\${input:project}
\`\`\`

### 1.2 Verify working tree is clean
\`\`\`bash
git status --short
\`\`\`
If uncommitted changes exist, describe them and ask the user whether to stash, commit, or abort.

### 1.3 Identify the active branch
\`\`\`bash
git branch --show-current
\`\`\`

### 1.4 Confirm the base branch
Default to \`\${input:baseBranch}\`. If not provided, detect from repo:
\`\`\`bash
az repos show --repository \${input:repo} --query defaultBranch -o tsv
# Returns e.g. refs/heads/dev — strip the prefix
\`\`\`
Always confirm with the user — merging into the wrong branch can trigger unintended pipelines or release gates.

---

## Phase 2: Ticket and Work Item Discovery

### 2.1 Extract ticket from branch name
\`\`\`bash
git branch --show-current
# Patterns: feature/PROJ-123-slug, PROJ-123/slug, PROJ-123-slug
\`\`\`
Extract using: \`[A-Z]+-[0-9]+\`

### 2.2 Fall back to commit messages
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --oneline
\`\`\`
Search commit subjects for \`[A-Z]+-[0-9]+\` or ADO work item patterns (\`#1234\`).

### 2.3 Resolve work item IDs
If \`\${input:workItems}\` is not provided, attempt to derive from the ticket:
\`\`\`bash
az boards work-item show --id <id> --query "fields.\"System.Title\"" -o tsv
\`\`\`
Confirm resolved work items with the user before linking.

### 2.4 Summarize commits for the Changes section
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --pretty=format:"%s" --no-merges
\`\`\`

---

## Phase 3: Push Branch

\`\`\`bash
git push -u origin $(git branch --show-current)
\`\`\`

If rejected (non-fast-forward), investigate before force-pushing. Confirm with the user.

---

## Phase 4: Build PR Description

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
- **Ticket(s)**: omit if no tracker URL configured; ADO work item links are set separately via \`--work-items\`, not in the description body
- **Changes**: 1–5 bullets, non-test changes only; name the component and behavior, never just "fixed bug"
- **Tests**: one bullet per test file added/modified; explicitly state if no tests were touched
- **Notes**: include only if there are migration steps, feature flags, deployment ordering, or known limitations

---

## Phase 5: Create the PR

\`\`\`bash
az repos pr create \\
  --repository "\${input:repo}" \\
  --source-branch "$(git branch --show-current)" \\
  --target-branch "\${input:baseBranch}" \\
  --title "[TICKET-xxx] <concise one-line summary>" \\
  --description "$(cat <<'EOF'
### Ticket(s)
...
EOF
)" \\
  --reviewers \${input:reviewers} \\
  --work-items \${input:workItems} \\
  $([ "\${input:draft}" = "true" ] && echo "--draft true") \\
  $([ "\${input:autoComplete}" = "true" ] && echo "--auto-complete true") \\
  --open
\`\`\`

**Auto-complete note:** Setting \`--auto-complete true\` will merge the PR automatically once all policies pass (required reviewers approved, build succeeded, work items linked). Only enable if the branch is fully ready and the team uses policy-gated auto-complete.

---

## Phase 6: Post-creation Steps

\`\`\`bash
# Print the PR URL
az repos pr show --id <prId> --query "repository.webUrl" -o tsv
\`\`\`

If the branch policy requires a minimum reviewer count and \`\${input:reviewers}\` was not provided, check the branch policy:
\`\`\`bash
az repos policy list --branch "\${input:baseBranch}" --repository-id \\
  $(az repos show --repository \${input:repo} --query id -o tsv)
\`\`\`

---

## Common Mistakes

- **Forgetting \`az devops configure --defaults\`** — Every \`az repos\` command needs org/project without defaults set. Do this first.
- **Wrong base branch** — Always confirm before pushing. Different branches may have different required reviewer policies and release gates.
- **Work items not linked** — ADO PRs without linked work items fail branch policies on many teams. Always link via \`--work-items\`, not just by mentioning the ID in the description.
- **Enabling auto-complete on a WIP branch** — Auto-complete triggers a merge as soon as policies pass. Never enable it on branches that are not fully ready.
- **Vague Changes bullets** — "Updated service" and "Fixed bug" tell reviewers nothing. Name the component, the behavior that changed, and why.
- **Skipping the Notes section when it matters** — Migration steps, feature flags, and deployment ordering buried in chat instead of the PR description cause incidents.
- **Draft vs non-draft confusion** — ADO draft PRs block voting and auto-complete. Use \`--draft true\` intentionally for WIP branches, and remember to publish before requesting review.
`.trim();

/**
 * Build a rendered pr-ado-open prompt by substituting all \${input:*} placeholders
 * with the caller-supplied values (or sensible defaults).
 */
export function buildOpenPrAdoPrompt(args: {
  org: string;
  project: string;
  repo: string;
  baseBranch?: string;
  jiraBaseUrl?: string;
  reviewers?: string;
  workItems?: string;
  draft?: boolean;
  autoComplete?: boolean;
}): string {
  return PR_ADO_OPEN_SKILL
    .replaceAll("${input:org}", args.org)
    .replaceAll("${input:project}", args.project)
    .replaceAll("${input:repo}", args.repo)
    .replaceAll("${input:baseBranch}", args.baseBranch ?? "dev")
    .replaceAll("${input:jiraBaseUrl}", args.jiraBaseUrl ?? "")
    .replaceAll("${input:reviewers}", args.reviewers ?? "")
    .replaceAll("${input:workItems}", args.workItems ?? "")
    .replaceAll("${input:draft}", String(args.draft ?? false))
    .replaceAll("${input:autoComplete}", String(args.autoComplete ?? false));
}
