# Test Suite Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use beads-superpowers:executing-plans. Each Task becomes a bead (`bd create -t task --parent <epic-id>`).

**Goal:** Get `pnpm test` back to a clean, deterministic pass. `pnpm test` currently fails with 1 stale assertion and 1 flaky-under-full-suite timeout (discovered while auditing this repo's remaining work on 2026-09-05; not previously tracked anywhere).

**Architecture:** N/A — both are test-file fixes, no production code changes.

**Tech Stack:** Vitest.

## Global Constraints

- Fix the assertion to match real behavior; do not silently loosen it (e.g., don't delete the length check instead of updating it).

---

### Task 1: Fix stale tool-count assertion in Claude server test

**Files:**
- Modify: `src/claude/__tests__/server.test.ts:79`

**Acceptance Criteria:**
- `pnpm vitest run src/claude/__tests__/server.test.ts` passes.
- The test asserts the tool list contains `"implement"` (added in commit `95a4f31`, "Add write-capable implement tool to the Claude bridge") in addition to the existing 28, and the length assertion is updated from `28` to `29`.

- [ ] **Step 1: Update the test**

```typescript
// src/claude/__tests__/server.test.ts
expect(toolNames).toContain("implement");
expect(tools).toHaveLength(29);
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run src/claude/__tests__/server.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/claude/__tests__/server.test.ts
git commit -m "test: update Claude server tool count for implement tool"
```

---

### Task 2: Investigate/harden the flaky Codex `code_review` JSON test

**Files:**
- Modify: `src/codex/__tests__/server.test.ts` (the `"returns structured JSON when codex produces valid review JSON"` test, currently ~line 132)

**Acceptance Criteria:**
- Root cause identified for why this test times out (10s) when run as part of the full `pnpm test` suite but passes in under 1s when run in isolation (`pnpm vitest run src/codex/__tests__/server.test.ts -t "returns structured JSON..."`).
- `pnpm test` (full suite, not just this file) passes twice in a row with no timeout on this test.

- [ ] **Step 1: Reproduce under full-suite load**

```bash
pnpm test
```
Confirm the timeout reproduces (it did during the 2026-09-05 audit).

- [ ] **Step 2: Investigate likely cause**

Check whether the mocked `child_process.spawn`/subprocess helper this test relies on shares module-level state (a singleton, a shared mock queue, or an un-awaited previous test's spawn callback) with other tests in the same file or a sibling file that runs concurrently under Vitest's default parallel file execution.

- [ ] **Step 3: Fix (exact fix depends on Step 2's finding)**

If it's shared mock state: reset/isolate the mock per-test (e.g., `vi.clearAllMocks()`/`vi.resetModules()` in `beforeEach`, or move to `test.concurrent: false` / a dedicated `vi.mock` factory per test). If it's genuine Vitest worker resource contention: increase this specific test's timeout (`{ timeout: 15000 }` as the third arg to `it(...)`) only as a last resort, after confirming there is no shared-state bug — a longer timeout must not be the first fix attempted.

- [ ] **Step 4: Run full suite twice to confirm stability**

```bash
pnpm test && pnpm test
```
Expected: both runs PASS with no timeout.

- [ ] **Step 5: Commit**

```bash
git add src/codex/__tests__/server.test.ts
git commit -m "test: fix flaky Codex code_review JSON test under full-suite run"
```
