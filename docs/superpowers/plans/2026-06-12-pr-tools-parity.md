# PR Tools Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four PR workflow tools (`open_pr_gh`, `review_pr_gh`, `open_pr_ado`, `review_pr_ado`) to all three MCP bridge servers, and add a `review` tool to the Codex and Copilot servers to match Claude's existing tool.

**Architecture:** Four shared skill files in `src/shared/` export `buildXxxPrompt()` functions that embed the PR workflow instructions with user-supplied inputs substituted via `.replaceAll()`. Server handlers return the rendered string directly as the tool result — no subprocess is spawned. The `review` parity in Codex and Copilot follows the existing `code_review` inline-spawn pattern (same prompt, same JSON fallback).

**Tech Stack:** TypeScript, Zod, Vitest, MCP SDK (`@modelcontextprotocol/sdk`)

---

### Escaping convention for skill constants

Skill content is stored in a template literal. Two escaping rules apply:

1. Triple backticks → `\`\`\`` (so code fences don't terminate the template literal)
2. `${input:varName}` placeholders → `\${input:varName}` (so JS doesn't try to interpolate them; `.replaceAll()` then substitutes the real value)

---

### Task 1: Create `src/shared/pr-gh-open-skill.ts`

**Files:**
- Create: `src/shared/pr-gh-open-skill.ts`
- Create: `src/shared/__tests__/pr-gh-open-skill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/__tests__/pr-gh-open-skill.test.ts
import { describe, it, expect } from "vitest";
import { buildOpenPrGhPrompt } from "../pr-gh-open-skill.js";

describe("buildOpenPrGhPrompt", () => {
  it("substitutes baseBranch in output", () => {
    const result = buildOpenPrGhPrompt({ baseBranch: "main" });
    expect(result).toContain("main");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("defaults baseBranch to dev", () => {
    const result = buildOpenPrGhPrompt({});
    expect(result).toContain("dev");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("substitutes jiraBaseUrl when provided", () => {
    const result = buildOpenPrGhPrompt({ jiraBaseUrl: "https://jira.example.com/browse" });
    expect(result).toContain("https://jira.example.com/browse");
    expect(result).not.toContain("${input:jiraBaseUrl}");
  });

  it("substitutes reviewers when provided", () => {
    const result = buildOpenPrGhPrompt({ reviewers: "alice,bob" });
    expect(result).toContain("alice,bob");
    expect(result).not.toContain("${input:reviewers}");
  });

  it("substitutes draft flag", () => {
    const result = buildOpenPrGhPrompt({ draft: true });
    expect(result).toContain("true");
    expect(result).not.toContain("${input:draft}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildOpenPrGhPrompt({});
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 5");
    expect(result.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shared/__tests__/pr-gh-open-skill.test.ts
```
Expected: FAIL — "Cannot find module '../pr-gh-open-skill.js'"

- [ ] **Step 3: Write the implementation**

The `PR_GH_OPEN_SKILL` constant is the full content of `~/.claude/skills/pr-gh-open`
with the two escaping rules applied (triple backtick → `\`\`\``, `${input:x}` → `\${input:x}`).
The excerpt below shows the escaping pattern; fill in the full file content:

```typescript
// src/shared/pr-gh-open-skill.ts
const PR_GH_OPEN_SKILL = `# Open PR (GitHub)

Push the active branch and open a GitHub pull request with a structured description,
linked ticket, reviewers, and labels in one pass.

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
Default to \${input:baseBranch}. If not provided, detect from repo conventions:
\`\`\`bash
git branch -r | grep -E 'origin/(dev|develop|main|master)$' | head -5
\`\`\`
Always confirm with the user before proceeding.

## Phase 2: Ticket and Commit Discovery

### 2.2 Fall back to commit messages
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --oneline
\`\`\`

### 2.3 Summarize commits for the Changes section
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --pretty=format:"%s" --no-merges
\`\`\`

## Phase 3: Push Branch

\`\`\`bash
git push -u origin $(git branch --show-current)
\`\`\`

## Phase 4: Build PR Description

\`\`\`markdown
### Ticket(s)
- [TICKET-xxx](\${input:jiraBaseUrl}/TICKET-xxx)

### Changes
- <specific change 1>

### Tests
- <TestClassName>: <what was added or changed>

### Notes
<optional>
\`\`\`

## Phase 5: Create the PR

\`\`\`bash
gh pr create \\
  --base "\${input:baseBranch}" \\
  --title "[TICKET-xxx] <summary>" \\
  --body "..." \\
  --reviewer "\${input:reviewers}" \\
  --label "\${input:labels}" \\
  $([ "\${input:draft}" = "true" ] && echo "--draft")
\`\`\`

## Phase 6: Post-creation Steps

\`\`\`bash
gh pr view --web 2>/dev/null || gh pr view --json url -q .url
\`\`\`

## Common Mistakes

- **Wrong base branch** — Always confirm before pushing.
- **Vague Changes bullets** — Name the component and behavior, never "fixed bug".
- **Forgetting draft mode for WIP branches** — Use --draft intentionally.`.trim();

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/shared/__tests__/pr-gh-open-skill.test.ts
```
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/pr-gh-open-skill.ts src/shared/__tests__/pr-gh-open-skill.test.ts
git commit -m "feat: add pr-gh-open shared skill"
```

---

### Task 2: Create `src/shared/pr-gh-review-skill.ts`

**Files:**
- Create: `src/shared/pr-gh-review-skill.ts`
- Create: `src/shared/__tests__/pr-gh-review-skill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/__tests__/pr-gh-review-skill.test.ts
import { describe, it, expect } from "vitest";
import { buildReviewPrGhPrompt } from "../pr-gh-review-skill.js";

describe("buildReviewPrGhPrompt", () => {
  it("substitutes pr number", () => {
    const result = buildReviewPrGhPrompt({ pr: "42" });
    expect(result).toContain("42");
    expect(result).not.toContain("${input:pr}");
  });

  it("substitutes repo when provided", () => {
    const result = buildReviewPrGhPrompt({ pr: "42", repo: "org/my-service" });
    expect(result).toContain("org/my-service");
    expect(result).not.toContain("${input:repo}");
  });

  it("leaves repo placeholder empty when not provided", () => {
    const result = buildReviewPrGhPrompt({ pr: "42" });
    expect(result).not.toContain("${input:repo}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildReviewPrGhPrompt({ pr: "42" });
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 4");
    expect(result.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shared/__tests__/pr-gh-review-skill.test.ts
```
Expected: FAIL — "Cannot find module '../pr-gh-review-skill.js'"

- [ ] **Step 3: Write the implementation**

The `PR_GH_REVIEW_SKILL` constant is the full content of `~/.claude/skills/pr-gh-code-review`
with escaping applied (triple backtick → `\`\`\``, `${input:x}` → `\${input:x}`):

```typescript
// src/shared/pr-gh-review-skill.ts
const PR_GH_REVIEW_SKILL = `# PR Code Review (GitHub)

Systematic, file-by-file code review that posts inline comments and a verdict
directly to the GitHub PR.

## Phase 1: Pre-Review Analysis

### 1.1 Fetch PR metadata
\`\`\`bash
gh pr view \${input:pr} --json title,body,baseRefName,headRefName,author,labels,files,additions,deletions
\`\`\`

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

## Phase 2: Per-File Systematic Review

For each changed file, read the full file (not just the diff) to understand context:
\`\`\`bash
gh api repos/\${input:repo}/contents/<path>?ref=$(gh pr view \${input:pr} --json headRefName -q .headRefName) \\
  --jq '.content' | base64 -d
\`\`\`

Apply correctness, security, best practices, performance, and style checklists.
Record findings as { path, line, body } objects.

## Phase 3: Cross-Cutting Concerns

Review test coverage, breaking changes, dependencies, and documentation once
across the whole PR (not per-file).

## Phase 4: Post Inline Comments and Verdict

### 4.1 Build the review payload
\`\`\`bash
OWNER_REPO="\${input:repo}"
PR_NUMBER=$(gh pr view \${input:pr} --json number -q .number)

gh api repos/\${OWNER_REPO}/pulls/\${PR_NUMBER}/reviews \\
  --method POST \\
  --input - <<'EOF'
{
  "body": "## Review Summary\\n\\n[assessment]\\n\\n**Critical:** X\\n**Medium:** Y\\n**Low:** Z",
  "event": "REQUEST_CHANGES",
  "comments": [
    {
      "path": "src/example.ts",
      "line": 42,
      "body": "**Critical — null deref:** description and fix here."
    }
  ]
}
EOF
\`\`\`

event values: APPROVE (no blocking issues) | REQUEST_CHANGES (Critical/Medium) | COMMENT (Low only)

## Common Mistakes

- **Posting comments without reading the full file** — Diff context is misleading.
- **Vague comments** — Every comment must say what to change and why.
- **Duplicating existing feedback** — Check existing review threads before posting.`.trim();

export function buildReviewPrGhPrompt(args: {
  pr: string;
  repo?: string;
}): string {
  return PR_GH_REVIEW_SKILL
    .replaceAll("${input:pr}", args.pr)
    .replaceAll("${input:repo}", args.repo ?? "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/shared/__tests__/pr-gh-review-skill.test.ts
```
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/pr-gh-review-skill.ts src/shared/__tests__/pr-gh-review-skill.test.ts
git commit -m "feat: add pr-gh-review shared skill"
```

---

### Task 3: Create `src/shared/pr-ado-open-skill.ts`

**Files:**
- Create: `src/shared/pr-ado-open-skill.ts`
- Create: `src/shared/__tests__/pr-ado-open-skill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/__tests__/pr-ado-open-skill.test.ts
import { describe, it, expect } from "vitest";
import { buildOpenPrAdoPrompt } from "../pr-ado-open-skill.js";

const REQUIRED = {
  org: "https://dev.azure.com/myorg",
  project: "MyProject",
  repo: "my-service",
};

describe("buildOpenPrAdoPrompt", () => {
  it("substitutes org, project, repo", () => {
    const result = buildOpenPrAdoPrompt(REQUIRED);
    expect(result).toContain("https://dev.azure.com/myorg");
    expect(result).toContain("MyProject");
    expect(result).toContain("my-service");
    expect(result).not.toContain("${input:org}");
    expect(result).not.toContain("${input:project}");
    expect(result).not.toContain("${input:repo}");
  });

  it("defaults baseBranch to dev", () => {
    const result = buildOpenPrAdoPrompt(REQUIRED);
    expect(result).toContain("dev");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("substitutes baseBranch when provided", () => {
    const result = buildOpenPrAdoPrompt({ ...REQUIRED, baseBranch: "main" });
    expect(result).toContain("main");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("substitutes workItems when provided", () => {
    const result = buildOpenPrAdoPrompt({ ...REQUIRED, workItems: "1234 5678" });
    expect(result).toContain("1234 5678");
    expect(result).not.toContain("${input:workItems}");
  });

  it("substitutes autoComplete flag", () => {
    const result = buildOpenPrAdoPrompt({ ...REQUIRED, autoComplete: true });
    expect(result).toContain("true");
    expect(result).not.toContain("${input:autoComplete}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildOpenPrAdoPrompt(REQUIRED);
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 5");
    expect(result.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shared/__tests__/pr-ado-open-skill.test.ts
```
Expected: FAIL — "Cannot find module '../pr-ado-open-skill.js'"

- [ ] **Step 3: Write the implementation**

The `PR_ADO_OPEN_SKILL` constant is the full content of `~/.claude/skills/pr-ado-open`
with escaping applied (triple backtick → `\`\`\``, `${input:x}` → `\${input:x}`):

```typescript
// src/shared/pr-ado-open-skill.ts
const PR_ADO_OPEN_SKILL = `# Open PR (Azure DevOps)

Push the active branch and open an Azure DevOps pull request with a structured
description, linked work items, reviewers, and optional auto-complete in one pass.

## Phase 1: Setup and Pre-flight

### 1.1 Configure defaults
\`\`\`bash
az devops configure --defaults organization=\${input:org} project=\${input:project}
\`\`\`

### 1.2 Verify working tree is clean
\`\`\`bash
git status --short
\`\`\`

### 1.3 Identify the active branch
\`\`\`bash
git branch --show-current
\`\`\`

### 1.4 Confirm the base branch
Default to \${input:baseBranch}. If not provided, detect from repo:
\`\`\`bash
az repos show --repository \${input:repo} --query defaultBranch -o tsv
\`\`\`
Always confirm with the user.

## Phase 2: Ticket and Work Item Discovery

### 2.3 Resolve work item IDs
If workItems is not provided, attempt to derive from the ticket:
\`\`\`bash
az boards work-item show --id <id> --query "fields.\\"System.Title\\"" -o tsv
\`\`\`

### 2.4 Summarize commits for the Changes section
\`\`\`bash
git log origin/\${input:baseBranch}..HEAD --pretty=format:"%s" --no-merges
\`\`\`

## Phase 3: Push Branch

\`\`\`bash
git push -u origin $(git branch --show-current)
\`\`\`

## Phase 4: Build PR Description

\`\`\`markdown
### Ticket(s)
- [TICKET-xxx](\${input:jiraBaseUrl}/TICKET-xxx)

### Changes
- <specific change 1>

### Tests
- <TestClassName>: <what was added or changed>

### Notes
<optional>
\`\`\`

## Phase 5: Create the PR

\`\`\`bash
az repos pr create \\
  --repository "\${input:repo}" \\
  --source-branch "$(git branch --show-current)" \\
  --target-branch "\${input:baseBranch}" \\
  --title "[TICKET-xxx] <summary>" \\
  --description "..." \\
  --reviewers \${input:reviewers} \\
  --work-items \${input:workItems} \\
  $([ "\${input:draft}" = "true" ] && echo "--draft true") \\
  $([ "\${input:autoComplete}" = "true" ] && echo "--auto-complete true") \\
  --open
\`\`\`

## Common Mistakes

- **Forgetting az devops configure --defaults** — Do this first or every command needs explicit flags.
- **Work items not linked** — Always link via --work-items, not just in the description.
- **Enabling auto-complete on a WIP branch** — Only enable when the branch is fully ready.`.trim();

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/shared/__tests__/pr-ado-open-skill.test.ts
```
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/pr-ado-open-skill.ts src/shared/__tests__/pr-ado-open-skill.test.ts
git commit -m "feat: add pr-ado-open shared skill"
```

---

### Task 4: Create `src/shared/pr-ado-review-skill.ts`

**Files:**
- Create: `src/shared/pr-ado-review-skill.ts`
- Create: `src/shared/__tests__/pr-ado-review-skill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/__tests__/pr-ado-review-skill.test.ts
import { describe, it, expect } from "vitest";
import { buildReviewPrAdoPrompt } from "../pr-ado-review-skill.js";

const REQUIRED = {
  prId: "1234",
  org: "https://dev.azure.com/myorg",
  project: "MyProject",
  repo: "my-service",
};

describe("buildReviewPrAdoPrompt", () => {
  it("substitutes all required inputs", () => {
    const result = buildReviewPrAdoPrompt(REQUIRED);
    expect(result).toContain("1234");
    expect(result).toContain("https://dev.azure.com/myorg");
    expect(result).toContain("MyProject");
    expect(result).toContain("my-service");
    expect(result).not.toContain("${input:prId}");
    expect(result).not.toContain("${input:org}");
    expect(result).not.toContain("${input:project}");
    expect(result).not.toContain("${input:repo}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildReviewPrAdoPrompt(REQUIRED);
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 4");
    expect(result.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shared/__tests__/pr-ado-review-skill.test.ts
```
Expected: FAIL — "Cannot find module '../pr-ado-review-skill.js'"

- [ ] **Step 3: Write the implementation**

The `PR_ADO_REVIEW_SKILL` constant is the full content of `~/.claude/skills/pr-ado-code-review`
with escaping applied (triple backtick → `\`\`\``, `${input:x}` → `\${input:x}`):

```typescript
// src/shared/pr-ado-review-skill.ts
const PR_ADO_REVIEW_SKILL = `# PR Code Review (Azure DevOps)

Systematic, file-by-file code review that posts inline thread comments and a vote
directly to the ADO PR.

## Setup

\`\`\`bash
az devops configure --defaults organization=\${input:org} project=\${input:project}
\`\`\`

## Phase 1: Pre-Review Analysis

### 1.1 Fetch PR metadata
\`\`\`bash
az repos pr show --id \${input:prId}
\`\`\`

### 1.2 List changed files
\`\`\`bash
az repos pr list-changes --id \${input:prId}
\`\`\`

### 1.3 Fetch the latest iteration ID (needed for inline comments)
\`\`\`bash
az rest --method get \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/iterations?api-version=7.1" \\
  --query "value[-1].id"
\`\`\`
Store as ITERATION_ID — required when posting inline thread comments.

### 1.5 Check existing review threads to avoid duplication
\`\`\`bash
az rest --method get \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/threads?api-version=7.1" \\
  --query "value[?status!='closed']"
\`\`\`

## Phase 2: Per-File Systematic Review

Apply correctness, security, best practices, performance, and style checklists.
Record findings as inline comment payloads.

## Phase 3: Cross-Cutting Concerns

Review test coverage, breaking changes, dependencies, and documentation once
across the whole PR.

## Phase 4: Post Inline Thread Comments and Vote

### 4.1 Post an inline thread comment
\`\`\`bash
az rest --method post \\
  --url "\${input:org}/\${input:project}/_apis/git/repositories/\${input:repo}/pullRequests/\${input:prId}/threads?api-version=7.1" \\
  --headers "Content-Type=application/json" \\
  --body '{
    "comments": [{ "content": "**Critical — Security:** description.", "commentType": 1 }],
    "threadContext": {
      "filePath": "/src/example.ts",
      "rightFileStart": { "line": 42, "offset": 1 },
      "rightFileEnd": { "line": 42, "offset": 80 }
    },
    "status": 1
  }'
\`\`\`

### 4.2 Post overall summary comment
\`\`\`bash
az repos pr comment create --id \${input:prId} --text "## Review Summary\\n..."
\`\`\`

### 4.3 Cast your vote
\`\`\`bash
# approve | approved with suggestions | wait for author | reject
az repos pr set-vote --id \${input:prId} --vote "wait for author"
\`\`\`

## Common Mistakes

- **Forgetting to configure defaults** — Set defaults first or every command needs explicit flags.
- **Wrong vote string** — Use exact values: approve, approved with suggestions, wait for author, reject.
- **Missing iterationId for inline comments** — Always fetch it in Phase 1 before posting threads.`.trim();

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/shared/__tests__/pr-ado-review-skill.test.ts
```
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/pr-ado-review-skill.ts src/shared/__tests__/pr-ado-review-skill.test.ts
git commit -m "feat: add pr-ado-review shared skill"
```

---

### Task 5: Register all 4 PR tools in `src/claude/server.ts`

**Files:**
- Modify: `src/claude/server.ts`

- [ ] **Step 1: Add imports at the top of `src/claude/server.ts`**

Add after the last existing `buildXxx` import (currently `buildTechResumeOptimizerPrompt`):

```typescript
import { buildOpenPrGhPrompt } from "../shared/pr-gh-open-skill.js";
import { buildReviewPrGhPrompt } from "../shared/pr-gh-review-skill.js";
import { buildOpenPrAdoPrompt } from "../shared/pr-ado-open-skill.js";
import { buildReviewPrAdoPrompt } from "../shared/pr-ado-review-skill.js";
```

- [ ] **Step 2: Register `open_pr_gh` in `createClaudeServer()`**

Add before the closing `return server;` of `createClaudeServer()`:

```typescript
  server.registerTool(
    "open_pr_gh",
    {
      title: "Open PR (GitHub)",
      description:
        "Push the active branch and open a GitHub pull request with a structured description, linked ticket, reviewers, and labels. Returns step-by-step workflow instructions.",
      inputSchema: {
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Comma-separated GitHub usernames"),
        labels: z.string().optional().describe("Comma-separated PR labels"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
      },
    },
    async ({ baseBranch, jiraBaseUrl, reviewers, labels, draft }) => {
      const instructions = buildOpenPrGhPrompt({ baseBranch, jiraBaseUrl, reviewers, labels, draft });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );
```

- [ ] **Step 3: Register `review_pr_gh` in `createClaudeServer()`**

```typescript
  server.registerTool(
    "review_pr_gh",
    {
      title: "Review PR (GitHub)",
      description:
        "Systematic file-by-file GitHub PR code review. Posts inline comments and a verdict. Returns step-by-step workflow instructions.",
      inputSchema: {
        pr: z.string().describe("GitHub PR URL or number"),
        repo: z.string().optional().describe("owner/repo slug (inferred from URL if omitted)"),
      },
    },
    async ({ pr, repo }) => {
      const instructions = buildReviewPrGhPrompt({ pr, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );
```

- [ ] **Step 4: Register `open_pr_ado` in `createClaudeServer()`**

```typescript
  server.registerTool(
    "open_pr_ado",
    {
      title: "Open PR (Azure DevOps)",
      description:
        "Push the active branch and open an Azure DevOps pull request with a structured description, linked work items, and optional auto-complete. Returns step-by-step workflow instructions.",
      inputSchema: {
        org: z.string().describe("Azure DevOps organization URL (e.g. https://dev.azure.com/myorg)"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Space-separated reviewer emails"),
        workItems: z.string().optional().describe("Space-separated ADO work item IDs to link"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
        autoComplete: z.boolean().optional().describe("Enable auto-complete on creation (default: false)"),
      },
    },
    async ({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete }) => {
      const instructions = buildOpenPrAdoPrompt({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );
```

- [ ] **Step 5: Register `review_pr_ado` in `createClaudeServer()`**

```typescript
  server.registerTool(
    "review_pr_ado",
    {
      title: "Review PR (Azure DevOps)",
      description:
        "Systematic file-by-file ADO PR code review. Posts inline thread comments and a vote. Returns step-by-step workflow instructions.",
      inputSchema: {
        prId: z.string().describe("ADO pull request ID"),
        org: z.string().describe("Azure DevOps organization URL"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
      },
    },
    async ({ prId, org, project, repo }) => {
      const instructions = buildReviewPrAdoPrompt({ prId, org, project, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );
```

- [ ] **Step 6: Run the full test suite**

```bash
pnpm test src/claude/__tests__/server.test.ts
```
Expected: All existing Claude tests PASS (new tools have no tests yet — covered in Task 8)

- [ ] **Step 7: Commit**

```bash
git add src/claude/server.ts
git commit -m "feat: register PR tools in Claude server"
```

---

### Task 6: Add `review` tool + register 4 PR tools in `src/codex/server.ts`

**Files:**
- Modify: `src/codex/server.ts`

- [ ] **Step 1: Add imports at the top of `src/codex/server.ts`**

Add after the last existing `buildXxx` import:

```typescript
import { buildOpenPrGhPrompt } from "../shared/pr-gh-open-skill.js";
import { buildReviewPrGhPrompt } from "../shared/pr-gh-review-skill.js";
import { buildOpenPrAdoPrompt } from "../shared/pr-ado-open-skill.js";
import { buildReviewPrAdoPrompt } from "../shared/pr-ado-review-skill.js";
```

- [ ] **Step 2: Register `review` tool in `createCodexServer()`**

Add after the existing `code_review` tool registration:

```typescript
  server.registerTool(
    "review",
    {
      title: "Review",
      description:
        "Send a plan, diff, or implementation to Codex for independent review. Returns structured JSON with verdict, issues, and suggestions.",
      inputSchema: {
        content: z
          .string()
          .max(500_000)
          .describe("The code, plan, or diff to review"),
        context: z
          .string()
          .optional()
          .describe("Additional context about what is being reviewed"),
      },
    },
    async ({ content, context }) => {
      const agentInstructions = await loadAgentInstructions();

      const reviewPrompt = `${agentInstructions ? agentInstructions + "\n\n" : ""}Review the following and respond with ONLY valid JSON matching this exact schema (no markdown fencing, no extra text):
{"verdict": "APPROVED" or "NEEDS_REVISION", "issues": [{"severity": "critical" or "major" or "minor", "description": "...", "recommendation": "..."}], "suggestions": ["..."]}

${context ? `Context: ${context}\n\n` : ""}${content}`;

      const result = await runCodex(reviewPrompt);

      try {
        const parsed: unknown = JSON.parse(result.text);
        if (
          parsed &&
          typeof parsed === "object" &&
          "verdict" in parsed &&
          "issues" in parsed
        ) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(parsed, null, 2) },
            ],
          };
        }
      } catch {
        // Codex doesn't support schema-constrained output, so raw text is expected
      }

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );
```

- [ ] **Step 3: Register `open_pr_gh`, `review_pr_gh`, `open_pr_ado`, `review_pr_ado`**

Add after the `review` tool from Step 2. Use exactly the same `registerTool` calls as Task 5 Steps 2–5 — same names, same inputSchema, same descriptions, same handler bodies (they all call `buildXxxPrompt` and return content directly):

```typescript
  server.registerTool(
    "open_pr_gh",
    {
      title: "Open PR (GitHub)",
      description:
        "Push the active branch and open a GitHub pull request with a structured description, linked ticket, reviewers, and labels. Returns step-by-step workflow instructions.",
      inputSchema: {
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Comma-separated GitHub usernames"),
        labels: z.string().optional().describe("Comma-separated PR labels"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
      },
    },
    async ({ baseBranch, jiraBaseUrl, reviewers, labels, draft }) => {
      const instructions = buildOpenPrGhPrompt({ baseBranch, jiraBaseUrl, reviewers, labels, draft });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "review_pr_gh",
    {
      title: "Review PR (GitHub)",
      description:
        "Systematic file-by-file GitHub PR code review. Posts inline comments and a verdict. Returns step-by-step workflow instructions.",
      inputSchema: {
        pr: z.string().describe("GitHub PR URL or number"),
        repo: z.string().optional().describe("owner/repo slug (inferred from URL if omitted)"),
      },
    },
    async ({ pr, repo }) => {
      const instructions = buildReviewPrGhPrompt({ pr, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "open_pr_ado",
    {
      title: "Open PR (Azure DevOps)",
      description:
        "Push the active branch and open an Azure DevOps pull request with a structured description, linked work items, and optional auto-complete. Returns step-by-step workflow instructions.",
      inputSchema: {
        org: z.string().describe("Azure DevOps organization URL (e.g. https://dev.azure.com/myorg)"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Space-separated reviewer emails"),
        workItems: z.string().optional().describe("Space-separated ADO work item IDs to link"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
        autoComplete: z.boolean().optional().describe("Enable auto-complete on creation (default: false)"),
      },
    },
    async ({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete }) => {
      const instructions = buildOpenPrAdoPrompt({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "review_pr_ado",
    {
      title: "Review PR (Azure DevOps)",
      description:
        "Systematic file-by-file ADO PR code review. Posts inline thread comments and a vote. Returns step-by-step workflow instructions.",
      inputSchema: {
        prId: z.string().describe("ADO pull request ID"),
        org: z.string().describe("Azure DevOps organization URL"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
      },
    },
    async ({ prId, org, project, repo }) => {
      const instructions = buildReviewPrAdoPrompt({ prId, org, project, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );
```

- [ ] **Step 4: Run the Codex server tests**

```bash
pnpm test src/codex/__tests__/server.test.ts
```
Expected: All existing Codex tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/codex/server.ts
git commit -m "feat: add review tool and PR tools to Codex server"
```

---

### Task 7: Add `review` tool + register 4 PR tools in `src/copilot/server.ts`

**Files:**
- Modify: `src/copilot/server.ts`

- [ ] **Step 1: Add imports at the top of `src/copilot/server.ts`**

Add after the last existing `buildXxx` import:

```typescript
import { buildOpenPrGhPrompt } from "../shared/pr-gh-open-skill.js";
import { buildReviewPrGhPrompt } from "../shared/pr-gh-review-skill.js";
import { buildOpenPrAdoPrompt } from "../shared/pr-ado-open-skill.js";
import { buildReviewPrAdoPrompt } from "../shared/pr-ado-review-skill.js";
```

- [ ] **Step 2: Register `review` tool in `createCopilotServer()`**

Add after the existing `code_review` tool registration:

```typescript
  server.registerTool(
    "review",
    {
      title: "Review",
      description:
        "Send a plan, diff, or implementation to Copilot for independent review. Returns structured JSON with verdict, issues, and suggestions.",
      inputSchema: {
        content: z
          .string()
          .max(500_000)
          .describe("The code, plan, or diff to review"),
        context: z
          .string()
          .optional()
          .describe("Additional context about what is being reviewed"),
      },
    },
    async ({ content, context }) => {
      const reviewPrompt = `You are a code reviewer. Review the following and respond with ONLY valid JSON matching this exact schema (no markdown fencing, no extra text):
{"verdict": "APPROVED" or "NEEDS_REVISION", "issues": [{"severity": "critical" or "major" or "minor", "description": "...", "recommendation": "..."}], "suggestions": ["..."]}

${context ? `Context: ${context}\n\n` : ""}${content}`;

      const result = await runCopilot(reviewPrompt);

      try {
        const parsed: unknown = JSON.parse(result.text);
        if (
          parsed &&
          typeof parsed === "object" &&
          "verdict" in parsed &&
          "issues" in parsed
        ) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(parsed, null, 2) },
            ],
          };
        }
      } catch {
        // Copilot doesn't support schema-constrained output
      }

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );
```

- [ ] **Step 3: Register `open_pr_gh`, `review_pr_gh`, `open_pr_ado`, `review_pr_ado`**

Add after the `review` tool from Step 2. Use the same `registerTool` calls as Task 6 Step 3 — identical names, schemas, descriptions, and handler bodies:

```typescript
  server.registerTool(
    "open_pr_gh",
    {
      title: "Open PR (GitHub)",
      description:
        "Push the active branch and open a GitHub pull request with a structured description, linked ticket, reviewers, and labels. Returns step-by-step workflow instructions.",
      inputSchema: {
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Comma-separated GitHub usernames"),
        labels: z.string().optional().describe("Comma-separated PR labels"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
      },
    },
    async ({ baseBranch, jiraBaseUrl, reviewers, labels, draft }) => {
      const instructions = buildOpenPrGhPrompt({ baseBranch, jiraBaseUrl, reviewers, labels, draft });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "review_pr_gh",
    {
      title: "Review PR (GitHub)",
      description:
        "Systematic file-by-file GitHub PR code review. Posts inline comments and a verdict. Returns step-by-step workflow instructions.",
      inputSchema: {
        pr: z.string().describe("GitHub PR URL or number"),
        repo: z.string().optional().describe("owner/repo slug (inferred from URL if omitted)"),
      },
    },
    async ({ pr, repo }) => {
      const instructions = buildReviewPrGhPrompt({ pr, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "open_pr_ado",
    {
      title: "Open PR (Azure DevOps)",
      description:
        "Push the active branch and open an Azure DevOps pull request with a structured description, linked work items, and optional auto-complete. Returns step-by-step workflow instructions.",
      inputSchema: {
        org: z.string().describe("Azure DevOps organization URL (e.g. https://dev.azure.com/myorg)"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Space-separated reviewer emails"),
        workItems: z.string().optional().describe("Space-separated ADO work item IDs to link"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
        autoComplete: z.boolean().optional().describe("Enable auto-complete on creation (default: false)"),
      },
    },
    async ({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete }) => {
      const instructions = buildOpenPrAdoPrompt({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "review_pr_ado",
    {
      title: "Review PR (Azure DevOps)",
      description:
        "Systematic file-by-file ADO PR code review. Posts inline thread comments and a vote. Returns step-by-step workflow instructions.",
      inputSchema: {
        prId: z.string().describe("ADO pull request ID"),
        org: z.string().describe("Azure DevOps organization URL"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
      },
    },
    async ({ prId, org, project, repo }) => {
      const instructions = buildReviewPrAdoPrompt({ prId, org, project, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );
```

- [ ] **Step 4: Run the Copilot server tests**

```bash
pnpm test src/copilot/__tests__/server.test.ts
```
Expected: All existing Copilot tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/server.ts
git commit -m "feat: add review tool and PR tools to Copilot server"
```

---

### Task 8: Update server tests to cover new tools

**Files:**
- Modify: `src/codex/__tests__/server.test.ts`
- Modify: `src/copilot/__tests__/server.test.ts`
- Modify: `src/claude/__tests__/server.test.ts`

- [ ] **Step 1: Update the Codex server tool-list test**

Find the existing test `"registers codex, code_review, and codex_reply tools"` in
`src/codex/__tests__/server.test.ts` and extend it:

```typescript
  it("registers codex, code_review, codex_reply, review, and PR tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("codex");
    expect(toolNames).toContain("code_review");
    expect(toolNames).toContain("codex_reply");
    expect(toolNames).toContain("review");
    expect(toolNames).toContain("open_pr_gh");
    expect(toolNames).toContain("review_pr_gh");
    expect(toolNames).toContain("open_pr_ado");
    expect(toolNames).toContain("review_pr_ado");
  });
```

- [ ] **Step 2: Update the Copilot server tool-list test**

Find the equivalent test in `src/copilot/__tests__/server.test.ts` and extend it:

```typescript
  it("registers ask, code_review, review, and PR tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("ask");
    expect(toolNames).toContain("code_review");
    expect(toolNames).toContain("review");
    expect(toolNames).toContain("open_pr_gh");
    expect(toolNames).toContain("review_pr_gh");
    expect(toolNames).toContain("open_pr_ado");
    expect(toolNames).toContain("review_pr_ado");
  });
```

- [ ] **Step 3: Update the Claude server tool-list test**

Find the equivalent test in `src/claude/__tests__/server.test.ts` and add the new tool names:

```typescript
    expect(toolNames).toContain("open_pr_gh");
    expect(toolNames).toContain("review_pr_gh");
    expect(toolNames).toContain("open_pr_ado");
    expect(toolNames).toContain("review_pr_ado");
```

- [ ] **Step 4: Run all server tests**

```bash
pnpm test src/claude/__tests__/server.test.ts src/codex/__tests__/server.test.ts src/copilot/__tests__/server.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/claude/__tests__/server.test.ts src/codex/__tests__/server.test.ts src/copilot/__tests__/server.test.ts
git commit -m "test: verify PR tools and review registered in all servers"
```
