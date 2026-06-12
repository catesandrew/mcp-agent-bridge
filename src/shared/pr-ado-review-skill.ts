/**
 * Hard-coded pr-ado-code-review skill.
 *
 * Source: ~/.claude/skills/pr-ado-code-review/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 *
 * Escaping rules applied when embedding in the template literal:
 *   - Triple backticks (```) → \`\`\`
 *   - ${input:varName} placeholders → \${input:varName}  (preserved as literal text for .replaceAll())
 */
export const PR_ADO_REVIEW_SKILL = `
---
name: pr-ado-code-review
description: Use when the user wants a thorough code review on an Azure DevOps pull request, with inline thread comments posted directly to the PR via the Azure CLI and ADO REST API.
---

# PR Code Review (Azure DevOps)

Systematic, file-by-file code review that posts inline thread comments and a vote directly to the ADO PR. Reviews correctness, security, performance, and style — prioritized so the most important issues lead.

## Inputs

| Variable | Description | Example |
|----------|-------------|---------|
| \`\${input:prId}\` | ADO pull request ID | \`1234\` |
| \`\${input:org}\` | Azure DevOps organization URL | \`https://dev.azure.com/myorg\` |
| \`\${input:project}\` | ADO project name | \`MyProject\` |
| \`\${input:repo}\` | Repository name | \`my-service\` |

## Setup

Configure defaults once per session to avoid repeating org/project on every command:
\`\`\`bash
az devops configure --defaults organization=\${input:org} project=\${input:project}
\`\`\`

---

## Phase 1: Pre-Review Analysis

### 1.1 Fetch PR metadata
\`\`\`bash
az repos pr show --id \${input:prId}
\`\`\`

Extract: title, description, source/target branch, linked work items (\`workItemRefs\`), reviewers, status.

### 1.2 List changed files
\`\`\`bash
az repos pr list-changes --id \${input:prId}
\`\`\`

Note the change type for each file (\`add\`, \`edit\`, \`delete\`, \`rename\`).

### 1.3 Fetch the latest iteration ID (needed for inline comments)
\`\`\`bash
az rest --method get \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/iterations?api-version=7.1" \\
  --query "value[-1].id"
\`\`\`
Store as \`ITERATION_ID\` — required when posting inline thread comments.

### 1.4 Fetch full diff for an iteration
\`\`\`bash
az rest --method get \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/iterations/\${ITERATION_ID}/changes?api-version=7.1"
\`\`\`

### 1.5 Check existing review threads to avoid duplication
\`\`\`bash
az rest --method get \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/threads?api-version=7.1" \\
  --query "value[?status!='closed']"
\`\`\`

### 1.6 Read linked work items for intent
Work item IDs appear in \`workItemRefs\` from \`az repos pr show\`. Fetch each for the acceptance criteria:
\`\`\`bash
az boards work-item show --id <workItemId>
\`\`\`

### 1.7 Identify PR type
Classify to calibrate review depth:
- **Bug fix** — focus on correctness and regression risk
- **Feature** — focus on design, edge cases, and test coverage
- **Refactor** — focus on behavioral equivalence and test coverage
- **Dependency update** — check changelog, breaking changes, security advisories
- **Config/infra change** — check environment parity and rollback safety

---

## Phase 2: Per-File Systematic Review

For each changed file, fetch the full file content from the source branch for context:
\`\`\`bash
az repos show-ref --repo \${input:repo} --query "value[?name=='refs/heads/<sourceBranch>'].objectId" -o tsv | \\
xargs -I{} az rest --method get \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/items?path=/<filePath>&versionType=commit&version={}&api-version=7.1"
\`\`\`

Apply this checklist to each file and record findings as inline comment payloads (see Phase 4):

### Correctness (Critical)
- [ ] Does the logic match the stated intent in the PR description and linked work item?
- [ ] Are all code paths handled, including null/undefined/empty inputs?
- [ ] Are error conditions caught and handled or propagated correctly?
- [ ] Are there off-by-one errors, incorrect comparisons, or wrong operator precedence?
- [ ] Are async operations awaited? Are race conditions possible?
- [ ] Does state mutation happen in the right order?

### Security (Critical)
- [ ] Is any user input used in SQL, shell commands, file paths, or HTML without sanitization?
- [ ] Are secrets, tokens, or PII logged or returned in responses?
- [ ] Are authorization checks present on every code path that accesses protected resources?
- [ ] Are dependencies added from trusted sources with pinned versions?
- [ ] Are file uploads, redirects, or deserializations safe?

### Best Practices (Medium)
- [ ] Does the code follow existing patterns in the codebase?
- [ ] Are functions and variables named clearly and consistently?
- [ ] Is error handling consistent with the rest of the codebase?
- [ ] Are magic numbers or hardcoded values extracted to constants?
- [ ] Is the change backward compatible, or are callers/consumers updated?

### Performance (Medium)
- [ ] Are there N+1 queries or unbounded loops over large data sets?
- [ ] Are expensive operations called unnecessarily on hot paths?
- [ ] Are indexes or caches used where appropriate?
- [ ] Could any synchronous operation block a thread pool?

### Style & Readability (Low)
- [ ] Is the code self-documenting?
- [ ] Are there dead code blocks, commented-out code, or leftover debug statements?
- [ ] Do not flag formatting if the project uses auto-formatters.

---

## Phase 3: Cross-Cutting Concerns

Review these once across the whole PR:

### Test Coverage
- [ ] Are there tests for every new function or branch of logic?
- [ ] Do existing tests still cover the changed behavior, or do they need updating?
- [ ] Are edge cases (empty input, max values, error paths) tested?
- [ ] Are tests meaningful — do they assert behavior, not just that code runs?

### Breaking Changes
- [ ] Are any public APIs, interfaces, or contracts changed without a version bump?
- [ ] Are any database columns/tables renamed or dropped without a migration?
- [ ] Are any environment variables renamed or removed?
- [ ] Are any message/event schemas changed in a way that breaks consumers?

### Dependencies
- [ ] Are new dependencies justified?
- [ ] Are new dependencies well-maintained and free of known CVEs?
- [ ] Are lock files updated consistently with manifest files?

### Documentation
- [ ] Does a public-facing API or config change need a README or wiki update?
- [ ] Are new environment variables documented?

---

## Phase 4: Post Inline Thread Comments and Vote

### 4.1 Post an inline thread comment on a specific file and line

Each finding becomes a separate REST call. ADO uses \`threadContext\` to anchor a comment to a file and line range.

\`\`\`bash
az rest --method post \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/threads?api-version=7.1" \\
  --headers "Content-Type=application/json" \\
  --body '{
    "comments": [
      {
        "content": "**Critical — Security:** SQL query built with string concatenation. Parameterize: \`db.query(\"SELECT * FROM users WHERE id = ?\", [userId])\`.",
        "commentType": 1
      }
    ],
    "threadContext": {
      "filePath": "/src/api/users.ts",
      "rightFileStart": { "line": 42, "offset": 1 },
      "rightFileEnd":   { "line": 42, "offset": 80 }
    },
    "status": 1
  }'
\`\`\`

**Thread status values:**
| Value | Meaning |
|-------|---------|
| \`1\` | Active (default for new issues) |
| \`2\` | Fixed (resolved by author) |
| \`3\` | Won't fix |
| \`4\` | Closed |
| \`6\` | Pending |

### 4.2 Post an overall summary comment
\`\`\`bash
az repos pr comment create --id \${input:prId} \\
  --text "## Review Summary

**Critical:** X issue(s)
**Medium:** Y issue(s)
**Low:** Z issue(s)

[Overall assessment paragraph]"
\`\`\`

### 4.3 Cast your vote
\`\`\`bash
# Approve — no blocking issues
az repos pr set-vote --id \${input:prId} --vote approve

# Approved with suggestions — low-severity only, author may merge
az repos pr set-vote --id \${input:prId} --vote "approved with suggestions"

# Wait for author — one or more Critical or Medium issues
az repos pr set-vote --id \${input:prId} --vote "wait for author"

# Reject — fundamental design problem
az repos pr set-vote --id \${input:prId} --vote reject
\`\`\`

**Vote decision guide:**
| Findings | Vote |
|----------|------|
| No issues or trivial nits | \`approve\` |
| Low-severity suggestions only | \`approved with suggestions\` |
| Medium or Critical issues | \`wait for author\` |
| Design must be reworked | \`reject\` |

---

## Review Comment Format

Write thread comments so the author knows exactly what to change and why:

\`\`\`
**[Severity] — [Category]:** [Specific problem].
[Why it matters.]
[Suggested fix or example if helpful.]
\`\`\`

Examples:
- \`**Critical — Correctness:** \\\`retryCount\\\` is never reset between requests (line 18). Move initialization inside the request handler to prevent cross-request state bleed.\`
- \`**Medium — Security:** Authorization check is missing on the DELETE path (line 67). Add a permission guard before the delete call.\`
- \`**Low:** Unused import \\\`lodash/merge\\\` — remove to keep the bundle lean.\`

---

## Tone Guidelines

- Be constructive and collaborative, not adversarial.
- Distinguish "must fix before merge" from "consider for a follow-up".
- Acknowledge what is done well.
- Ask questions when intent is unclear rather than assuming it is wrong.

---

## Common Mistakes

- **Forgetting to configure defaults** — Without \`az devops configure --defaults\`, every command needs explicit \`--org\` and \`--project\` flags. Set defaults first.
- **Skipping work item context** — ADO PRs are typically linked to work items. Always read the linked ticket; it describes intent the diff alone does not show.
- **Wrong vote string** — Use exact values: \`approve\`, \`approved with suggestions\`, \`wait for author\`, \`reject\`. Any other string throws a CLI error.
- **Missing \`iterationId\` for inline comments** — The \`threadContext\` requires the latest iteration. Always fetch the iteration ID in Phase 1 before posting threads.
- **One REST call per comment** — Unlike GitHub, ADO requires a separate API call per inline thread. Batch your findings before posting to minimize round trips.
- **Posting without reading the full file** — Diff context is misleading. Read the surrounding code to confirm whether a finding is real.
- **Vague comments** — Every thread must say what to change and why. "This could be better" will not get addressed.
- **Duplicating existing threads** — Check open threads in Phase 1 before posting. Re-raising unresolved issues wastes the author's time.
`.trim();

/**
 * Build a rendered pr-ado-code-review prompt by substituting all \${input:*} placeholders
 * with the caller-supplied values.
 */
export function buildReviewPrAdoPrompt(args: {
  prId: string;
  org: string;
  project: string;
  repo: string;
}): string {
  return PR_ADO_REVIEW_SKILL
    .replaceAll("${input:prId}", args.prId)
    .replaceAll("${input:org}", args.org)
    .replaceAll("${input:project}", args.project)
    .replaceAll("${input:repo}", args.repo);
}
