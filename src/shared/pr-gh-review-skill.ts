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

## Phase 1.5: Graph Impact Analysis

Query the codebase-memory knowledge graph for structural impact before reading individual files. This surfaces blast radius, hidden dependencies, and cross-service risk that the diff alone cannot show.

**This phase is conditional.** Skip silently if no graph is indexed for this repo.

### 1.5.1 Probe for graph availability

Call \`list_projects\` (MCP tool: \`mcp__codebase-memory-mcp__list_projects\`). Match a project's \`root_path\` against the local repo root:

\`\`\`bash
git rev-parse --show-toplevel
\`\`\`

If no project matches, skip to Phase 2. If a match is found, note the \`project\` name for all subsequent graph calls.

### 1.5.2 Detect structural changes and their impact

Use \`detect_changes\` (MCP: \`mcp__codebase-memory-mcp__detect_changes\`) against the graph project with the PR's base branch:

\`\`\`
detect_changes(
  project = <matched project name>,
  base_branch = <baseRefName from 1.1>,
  depth = 2
)
\`\`\`

This returns changed symbols with their structural impact — callers affected, edges modified, risk tier. Use this output to prioritize which symbols need deeper tracing.

> **Note:** \`detect_changes\` runs \`git diff\` against the repo at \`root_path\`. It reflects the local working tree's current state against the base branch, not the remote PR head. Most accurate when the local repo is current with \`origin/<base>\`.

### 1.5.3 Blast radius — inbound callers of changed symbols

For each high-impact symbol identified in 1.5.2 (or extracted from the diff for the top 3–5 most central changed functions), call \`trace_path\` (MCP: \`mcp__codebase-memory-mcp__trace_path\`):

\`\`\`
trace_path(
  function_name = <symbol>,
  project = <project>,
  direction = "inbound",
  depth = 2,
  risk_labels = true
)
\`\`\`

**Interpret results:**
- **0 inbound callers** (excluding tests) → possible dead code; flag for the author
- **< 10 callers** → contained change, low blast radius
- **10–100 callers** → medium risk; verify all call sites handle the new behavior
- **> 100 callers** → high fan-in hot path; escalate to Critical in the review summary

### 1.5.4 Outbound dependency chain (for new or refactored functions)

For functions the PR introduces or significantly rewrites, trace outbound to understand what they now depend on:

\`\`\`
trace_path(
  function_name = <symbol>,
  project = <project>,
  direction = "outbound",
  depth = 3
)
\`\`\`

Look for: newly introduced dependencies on services, external calls, or shared singletons that could introduce latency, coupling, or failure modes.

### 1.5.5 HTTP surface (if PR touches routes or controllers)

If changed files include route definitions, controllers, or API handlers, query the HTTP call graph:

\`\`\`cypher
-- Which functions call the changed route path?
MATCH (f:Function)-[:HTTP_CALLS]->(r:Route)
WHERE r.path CONTAINS '<changed-path-fragment>'
RETURN f.name, f.file, r.method, r.path
ORDER BY f.name
\`\`\`

\`\`\`cypher
-- What does this endpoint handler call downstream?
MATCH (handler:Function)-[:CALLS*1..3]->(dep:Function)
WHERE handler.name = '<changed-handler>'
RETURN dep.name, dep.file
\`\`\`

Run via \`query_graph\` (MCP: \`mcp__codebase-memory-mcp__query_graph\`, \`project = <project>\`).

### 1.5.6 Cross-service boundary impact

If the PR touches a module that sits at a service boundary (e.g. shared libs, API clients, message queue publishers), check cross-service edges:

\`\`\`cypher
MATCH (src:Function)-[:CROSS_HTTP_CALLS|CROSS_ASYNC_CALLS]->(tgt:Function)
WHERE src.file CONTAINS '<changed-file-path-fragment>'
RETURN src.name, src.file, tgt.name, tgt.file
LIMIT 20
\`\`\`

If results exist, surface them prominently — cross-service changes can break consumers outside this repo.

### 1.5.7 Co-change signal — missing related files

Check whether files that historically co-change with the PR's changed files are absent from this PR:

\`\`\`cypher
MATCH (f1:File)-[:FILE_CHANGES_WITH]->(f2:File)
WHERE f1.path CONTAINS '<changed-file-path-fragment>'
  AND NOT f2.path IN [<list of all PR changed file paths>]
RETURN f2.path, count(*) AS cochange_count
ORDER BY cochange_count DESC
LIMIT 5
\`\`\`

Files with high co-change scores that are absent from the PR are candidates for a review comment: "Was it intentional to not update \`<file>\`?"

### 1.5.8 Record graph findings

Collect findings from 1.5.2–1.5.7 as a structured summary to use in Phase 2 and Phase 4:

\`\`\`
GRAPH_FINDINGS = {
  high_fan_in: [ { symbol, caller_count, risk } ],   // from 1.5.3
  dead_code_candidates: [ { symbol, file } ],         // 0 inbound callers
  new_dependencies: [ { symbol, depends_on, file } ], // from 1.5.4
  http_surface: [ { handler, route, method } ],       // from 1.5.5
  cross_service_edges: [ { src, tgt } ],              // from 1.5.6
  missing_co_changes: [ { file, cochange_score } ],   // from 1.5.7
}
\`\`\`

Feed \`high_fan_in\` and \`cross_service_edges\` into Phase 2 per-file checklist.
Feed all findings into Phase 4.1 review summary.

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
- [ ] **[Graph]** If this symbol has high fan-in (from 1.5.3), do all call sites handle the changed signature or behavior?

### Security (Critical)
- [ ] Is any user input used in SQL, shell commands, file paths, or HTML without sanitization?
- [ ] Are secrets, tokens, or PII logged or returned in responses?
- [ ] Are authorization checks present on every code path that accesses protected resources?
- [ ] Are dependencies added from trusted sources with pinned versions?
- [ ] Are file uploads, redirects, or deserializations safe?
- [ ] **[Graph]** If this is a cross-service boundary (from 1.5.6), are auth/validation contracts preserved for all consumers?

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
- [ ] **[Graph]** If fan-in > 100 (from 1.5.3), is the changed code on a hot path where performance matters?

### Style & Readability (Low)
- [ ] Is the code self-documenting? Would a new team member understand it?
- [ ] Are there dead code blocks, commented-out code, or leftover debug statements?
- [ ] Do not flag formatting if the project uses auto-formatters (Prettier, Black, gofmt, etc.).
- [ ] **[Graph]** If 0 inbound callers (from 1.5.3), is this function actually reachable? Flag as possible dead code.

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
- [ ] **[Graph]** Do \`cross_service_edges\` findings (from 1.5.6) indicate external consumers that aren't covered by this PR?
- [ ] **[Graph]** Do \`missing_co_changes\` (from 1.5.7) point to files that should have been updated?

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

If Phase 1.5 produced graph findings, include a **Graph Impact** section in the review body before the verdict. Format:

\`\`\`
### Graph Impact Analysis
- **Blast radius:** \`<symbol>\` has <N> inbound callers — <risk tier>
- **Hot path warning:** \`<symbol>\` is called from <N> sites; performance regressions will be wide
- **Dead code:** \`<symbol>\` has no inbound callers outside tests — confirm intentional
- **Cross-service:** This change crosses service boundaries to \`<tgt>\` — verify consumer compatibility
- **Missing co-changes:** \`<file>\` historically changes with this area (co-change score: N) — was it intentional to exclude it?
\`\`\`

Omit any category with no findings. Do not include graph boilerplate if Phase 1.5 was skipped.

\`\`\`bash
# Parse owner/repo/number from PR URL or use inputs
OWNER_REPO="\${input:repo}"
PR_NUMBER=$(gh pr view \${input:pr} --json number -q .number)

# Post review with inline comments in one API call
gh api repos/\${OWNER_REPO}/pulls/\${PR_NUMBER}/reviews \\
  --method POST \\
  --input - <<'EOF'
{
  "body": "## Review Summary\\n\\n[Overall assessment paragraph]\\n\\n### Graph Impact Analysis\\n[Graph findings or omit section]\\n\\n**Critical:** X issue(s)\\n**Medium:** Y issue(s)\\n**Low:** Z issue(s)",
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
- \`**Medium — Blast Radius:** \\\`processLoanApplication\\\` has 847 inbound callers. The changed null handling will affect all of them — confirm the new behavior is safe across all call sites.\`
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
- **Running graph queries on a missing project** — Always probe \`list_projects\` first. If no match, skip Phase 1.5 entirely rather than erroring.
- **Treating graph findings as definitive** — The graph reflects the indexed state (usually main/HEAD). New callers introduced in the PR itself won't appear yet. Use graph data as signal, not ground truth.
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
