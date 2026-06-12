/**
 * Hard-coded pr-gh-code-review skill.
 *
 * Source: ~/.claude/skills/pr-gh-code-review/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 *
 * Escaping rules applied when embedding in the template literal:
 *   - Triple backticks (```) → \`\`\`
 *   - ${input:varName} placeholders → \${input:varName}  (preserved as literal text for .replaceAll())
 */
export const PR_GH_REVIEW_SKILL = `
---
name: pr-gh-code-review
description: Use when the user wants a thorough code review on a GitHub pull request, with inline comments posted directly to the PR via the GitHub CLI and API.
---

# PR Code Review (GitHub)

Systematic, file-by-file code review that posts inline comments and a verdict directly to the GitHub PR. Reviews correctness, security, performance, and style — prioritized so the most important issues lead.

## Inputs

| Variable | Description | Example |
|----------|-------------|---------|
| \`\${input:pr}\` | GitHub PR URL or number | \`https://github.com/org/repo/pull/42\` or \`42\` |
| \`\${input:repo}\` | \`owner/repo\` slug (inferred from URL if omitted) | \`org/my-service\` |

## Phase 1: Pre-Review Analysis

### 1.1 Fetch PR metadata
\`\`\`bash
gh pr view \${input:pr} --json title,body,baseRefName,headRefName,author,labels,files,additions,deletions
\`\`\`

Extract: title, description, base branch, linked issues (\`Closes #...\` in body), labels, total additions/deletions.

### 1.2 Fetch the diff
\`\`\`bash
gh pr diff \${input:pr}
\`\`\`

### 1.3 List changed files with stats
\`\`\`bash
gh pr view \${input:pr} --json files --jq '.files[] | "\\(.additions)+\\(.deletions)-\\t\\(.path)"'
\`\`\`

### 1.4 Check existing review comments to avoid duplication
\`\`\`bash
gh pr view \${input:pr} --comments
gh api repos/\${input:repo}/pulls/$(gh pr view \${input:pr} --json number -q .number)/comments
\`\`\`

### 1.5 Identify PR type
Classify the change to calibrate review depth:
- **Bug fix** — focus on correctness and regression risk
- **Feature** — focus on design, edge cases, and test coverage
- **Refactor** — focus on behavioral equivalence and test coverage
- **Dependency update** — check changelog, breaking changes, security advisories
- **Config/infra change** — check environment parity and rollback safety

---

## Phase 2: Per-File Systematic Review

For each changed file, read the full file (not just the diff) to understand context:

\`\`\`bash
gh api repos/\${input:repo}/contents/<path>?ref=$(gh pr view \${input:pr} --json headRefName -q .headRefName) \\
  --jq '.content' | base64 -d
\`\`\`

Apply this checklist to each file and record findings as \`{ path, line, body }\` objects:

### Correctness (Critical)
- [ ] Does the logic match the stated intent in the PR description?
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
- [ ] Are expensive operations (network calls, disk I/O) called unnecessarily on hot paths?
- [ ] Are indexes or caches used where appropriate?
- [ ] Could any synchronous operation block the event loop or a thread pool?

### Style & Readability (Low)
- [ ] Is the code self-documenting? Would a new team member understand it?
- [ ] Are there dead code blocks, commented-out code, or leftover debug statements?
- [ ] Do not flag formatting if the project uses auto-formatters (Prettier, Black, gofmt, etc.).

---

## Phase 3: Cross-Cutting Concerns

Review these once across the whole PR (not per-file):

### Test Coverage
- [ ] Are there tests for every new function or branch of logic?
- [ ] Do existing tests still cover the changed behavior, or do they need updating?
- [ ] Are edge cases (empty input, max values, error paths) tested?
- [ ] Are tests meaningful — do they assert behavior, not just that code runs?

### Breaking Changes
- [ ] Are any public APIs, interfaces, or contracts changed without a version bump?
- [ ] Are any database columns/tables renamed or dropped without a migration?
- [ ] Are any environment variables renamed or removed?
- [ ] Are any message queue schemas changed in a way that breaks consumers?

### Dependencies
- [ ] Are new dependencies justified? Could the same be done with what is already in the project?
- [ ] Are new dependencies well-maintained and not flagged for known CVEs?
- [ ] Are lock files updated consistently with manifest files?

### Documentation
- [ ] Does a public-facing API or config change need a README or changelog update?
- [ ] Are new environment variables documented?

---

## Phase 4: Post Inline Comments and Verdict

### 4.1 Build the review payload

Collect all findings as a JSON review payload. Use \`start_line\`/\`line\` for multi-line comments.

\`\`\`bash
# Parse owner/repo/number from PR URL or use inputs
OWNER_REPO="\${input:repo}"
PR_NUMBER=$(gh pr view \${input:pr} --json number -q .number)

# Post review with inline comments in one API call
gh api repos/\${OWNER_REPO}/pulls/\${PR_NUMBER}/reviews \\
  --method POST \\
  --input - <<'EOF'
{
  "body": "## Review Summary\\n\\n[Overall assessment paragraph]\\n\\n**Critical:** X issue(s)\\n**Medium:** Y issue(s)\\n**Low:** Z issue(s)",
  "event": "REQUEST_CHANGES",
  "comments": [
    {
      "path": "src/example.ts",
      "line": 42,
      "body": "**Critical — null deref:** \`user.profile\` will throw if \`user\` is null. Use \`user?.profile ?? defaultProfile\`."
    },
    {
      "path": "src/api/handler.ts",
      "line": 18,
      "start_line": 15,
      "body": "**Security — missing auth check:** This endpoint modifies user data but has no authorization guard. Add a permission check before line 15."
    }
  ]
}
EOF
\`\`\`

**\`event\` values:**
| Value | When to use |
|-------|-------------|
| \`APPROVE\` | No blocking issues |
| \`REQUEST_CHANGES\` | One or more Critical or Medium issues |
| \`COMMENT\` | Questions or Low-only feedback, no verdict yet |

### 4.2 If no inline comments (file-level feedback only)

\`\`\`bash
gh pr review \${input:pr} --request-changes --body "..."
gh pr review \${input:pr} --approve --body "..."
gh pr review \${input:pr} --comment --body "..."
\`\`\`

### 4.3 Add a standalone comment for cross-cutting concerns

\`\`\`bash
gh pr comment \${input:pr} --body "### Cross-cutting concerns\\n\\n- ..."
\`\`\`

---

## Review Comment Format

Write inline comments so the author knows exactly what to change and why:

\`\`\`
**[Severity] — [Category]:** [Specific problem].
[Why it matters.]
[Suggested fix or example if helpful.]
\`\`\`

Examples:
- \`**Critical — Security:** SQL query built with string concatenation on line 23. Parameterize the query: \\\`db.query('SELECT * FROM users WHERE id = ?', [userId])\\\`.\`
- \`**Medium — Correctness:** \\\`retryCount\\\` is never reset between requests. Move initialization inside the request handler.\`
- \`**Low:** Unused import \\\`lodash/merge\\\` — remove to keep the bundle lean.\`

---

## Tone Guidelines

- Be constructive and collaborative, not adversarial.
- Distinguish "must fix before merge" from "consider for a follow-up".
- Acknowledge what is done well.
- Ask questions when intent is unclear rather than assuming it is wrong.

---

## Common Mistakes

- **Posting comments without reading the full file** — Diff context is often misleading. Read the surrounding code to understand whether a finding is real.
- **Blocking on style when critical issues exist** — Post critical findings first. Style-only comments on broken code send the wrong signal.
- **Fragmented reviews** — Posting 10 separate \`gh pr comment\` calls instead of one \`gh api reviews\` call creates noise. Batch all inline comments into one review submission.
- **Vague comments** — "This could be better" is not actionable. Every comment must say what to change and why.
- **Duplicating existing feedback** — Check existing review threads before posting. Re-raising resolved issues wastes the author's time.
- **Approving without checking tests** — Always verify the test coverage section before setting \`event: APPROVE\`.
`.trim();

/**
 * Build a rendered pr-gh-code-review prompt by substituting all ${input:*} placeholders
 * with the caller-supplied values.
 */
export function buildReviewPrGhPrompt(args: {
  pr: string;
  repo?: string;
}): string {
  return PR_GH_REVIEW_SKILL
    .replaceAll("${input:pr}", args.pr)
    .replaceAll("${input:repo}", args.repo ?? "");
}
