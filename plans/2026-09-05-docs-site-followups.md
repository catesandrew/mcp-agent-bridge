# Docs & Site Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use beads-superpowers:executing-plans to work these tasks. Each Task becomes a bead (`bd create -t task --parent <epic-id>`).

**Goal:** Close out the three open items left in `docs/sessions/2026-08-22-docs-skills-vercel/FOLLOWUPS.md` and its `BLOG.md` draft — two are user decisions, one is a small infra spike. No architecture is involved; this plan exists only to give each item a tracked bead with acceptance criteria, per the project's "everything remaining gets a bead" policy. No architect/consensus review round was run for this plan — the scope is three independent, low-risk, single-step items with no design ambiguity to review.

**Architecture:** N/A — no code architecture; these are a decision, a content-review gate, and a documentation spike.

**Tech Stack:** N/A

## Global Constraints

- None of these tasks may proceed without the user's explicit input — do not resolve the GitHub Pages or BLOG.md items unilaterally.

---

### Task 1: Decide whether to disable the old GitHub Pages site

**Files:**
- None (repo Settings → Pages is a GitHub UI action, not a file change)

**Acceptance Criteria:**
- User has explicitly chosen one of: (a) disable GitHub Pages in repo Settings, or (b) leave `catesandrew.github.io/mcp-agent-bridge/` live as a frozen, unlinked snapshot indefinitely (current default per `docs/sessions/2026-08-22-docs-skills-vercel/adr/0001-retire-github-pages-adopt-vercel.md`).
- If (a): Pages is confirmed disabled and the choice is recorded (e.g., a note in `docs/sessions/2026-08-22-docs-skills-vercel/FOLLOWUPS.md`).

- [ ] **Step 1: Ask the user for a decision** (blocked until answered)
- [ ] **Step 2: Action the decision and update `FOLLOWUPS.md`'s checkbox**

---

### Task 2: Review and publish (or discard) the BLOG.md draft

**Files:**
- Modify or leave as-is: `docs/sessions/2026-08-22-docs-skills-vercel/BLOG.md`

**Acceptance Criteria:**
- User has reviewed the draft's sanitization pass (it names real domains, a Vercel project ID, and a sibling project by name — see the file's own header warning).
- User has explicitly chosen to publish it, edit it further, or discard it.

- [ ] **Step 1: Present the draft to the user for review** (blocked until answered)
- [ ] **Step 2: Action the decision**

---

### Task 3: Spike — evaluate a real Vercel preview-deploy step for future infra changes

**Files:**
- Reference: `docs/sessions/2026-08-22-docs-skills-vercel/LESSONS.md` ("A brand-new Vercel project's first CLI deploy can silently skip the preview stage")

**Acceptance Criteria:**
- A short written recommendation (a few sentences, appended to `LESSONS.md` or a new note) on whether/how to seed a throwaway production deployment first so a genuine non-prod preview build becomes available for the *next* infra change on this project.
- No infra change is made now — this is a spike/recommendation only, since there is no active infra change to attach it to yet.

- [ ] **Step 1: Write the recommendation**
- [ ] **Step 2: Commit**

```bash
git add docs/sessions/2026-08-22-docs-skills-vercel/LESSONS.md
git commit -m "docs: record preview-deploy recommendation for future Vercel infra changes"
```
