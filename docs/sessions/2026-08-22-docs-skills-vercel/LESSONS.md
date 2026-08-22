# Lessons — Skills Catalog, README/site positioning, GitHub Pages → Vercel (2026-08-22)

## Vercel CLI cwd must match `rootDirectory`, not the subfolder it points at

- **What happened:** After patching the Vercel project with `rootDirectory: "website"`
  (to match a sibling project's setup), a plan draft still had `vercel link`/`vercel`/
  `vercel --prod` running from *inside* `website/`. Caught by Critic review before
  execution, not in production.
- **Why:** `rootDirectory` is relative to wherever the project is linked *from*. Linking
  from the repo root + setting `rootDirectory: "website"` tells Vercel "build the
  `website/` subfolder of what I'm looking at." Running the CLI from inside `website/`
  while that setting is active makes Vercel look for a nonexistent `website/website/`.
- **How to apply:** Verify on disk which directory a reference project's `.vercel/
  project.json` actually lives in (repo root vs. the subfolder) before copying its deploy
  shape — don't infer it from `rootDirectory` alone.
- **Evidence:** `next-starters/.vercel/project.json` exists at that sibling's repo root;
  `next-starters/website/.vercel/` does not exist.

## `rootDirectory` alone doesn't guarantee the right framework gets built

- **What happened:** Architect (post-fix re-review) flagged that setting only
  `rootDirectory` on project creation risked Vercel auto-detecting the framework from the
  *repo root's* `package.json` (this repo's `build: tsc`, an unrelated MCP bridge) instead
  of `website/package.json`, silently defaulting the output directory to `public/` and
  deploying a 404 site with zero build error.
- **Why:** Vercel's framework auto-detection runs against the linked directory at
  project-creation time, before `rootDirectory` is necessarily applied to that detection
  step.
- **How to apply:** When linking a Vercel project from a repo root with a non-trivial
  `rootDirectory`, PATCH `framework` explicitly in the same call — don't rely on
  auto-detection to find the right subfolder's stack.
- **Evidence:** `PATCH /v9/projects/... {"rootDirectory": "website", "framework":
  "docusaurus-2"}`, verified via `GET` before deploying.

## A brand-new Vercel project's first CLI deploy can silently skip the preview stage

- **What happened:** The plan called for a preview deploy (`vercel`, no `--prod`) before
  promoting to production, specifically to test an unverified pnpm-version/build-image
  combination before it went live. The actual first deploy on the brand-new project came
  back `target: production` directly — there was no existing production deployment for it
  to "preserve" while a preview built alongside, so Vercel treated the first-ever deploy as
  production. Caught by an independent post-implementation architect review, not
  self-reported.
- **Why:** The preview-vs-production distinction assumes a production deployment already
  exists to protect. On a project's very first deploy, that assumption doesn't hold.
- **How to apply:** If a genuine pre-production checkpoint matters (e.g. an unproven
  build-image combination), either accept that a brand-new project's first deploy IS the
  test, or seed a throwaway production deployment first so a real non-prod preview build
  becomes possible. Report the deviation honestly rather than upgrading it to "as planned."
- **Evidence:** Vercel deployment history showed exactly one deployment total, with
  `target: production, source: cli`, for what should have been a preview-first sequence.

## `vercel link --yes` does not resolve an ambiguous-git-remote prompt

- **What happened:** With two git remotes configured (`origin` + a fork remote), `vercel
  link --yes` still hung on an interactive "Which remote do you want to connect?" prompt
  despite `--yes`. The project itself still got created/linked; only the git-connect
  sub-step stalled and was effectively skipped.
- **Why:** `--yes` covers *some* default choices, not every interactive prompt Vercel's
  CLI can surface — an ambiguous choice among multiple valid remotes isn't one of them.
- **How to apply:** Use `vercel git connect <explicit-remote-url> --yes` (the URL as a
  positional argument) instead of the bare `git connect`/`link` flow when a repo has more
  than one git remote — it skips the picker entirely.
- **Evidence:** `vercel git connect git@github.com:catesandrew/mcp-agent-bridge.git --yes`
  → `Connected`, confirmed via a subsequent `GET` on the project showing `link` populated,
  and proven end-to-end by pushing a follow-up commit and watching it auto-deploy.

## Multi-round adversarial review earns its cost on real-infra plans

- **What happened:** Round 1 of Architect+Critic review found 4 real issues. The fix for
  one of them (reordering the domain cutover) introduced a *new* sequencing bug, caught by
  round 2's Architect. Round 2's *own* fix (adding a `rootDirectory` PATCH) was itself
  inconsistent with an unchanged CLI cwd, caught by round 2's Critic. Post-implementation,
  an independent architect verification (not a rubber stamp) caught 2 more real gaps that
  no amount of pre-implementation review could have — they only existed once the plan met
  reality (Vercel's actual first-deploy behavior, the ambiguous-remote prompt).
- **Why:** Each review pass targets a different bug class — one round's fix is the next
  round's fresh surface to check, and no amount of static plan review substitutes for
  checking what actually happened after execution.
- **How to apply:** For changes involving real, hard-to-reverse infra (DNS, hosting
  cutovers), budget for both pre-implementation consensus review *and* a genuinely
  independent post-implementation verification pass — treat a "looks done" self-report as
  insufficient on its own.
- **Evidence:** `.omc/plans/2026-08-22-docs-skills-catalog-vercel.md`'s own Changelog
  section, which records each round's finding and fix in order.

---

Candidates to promote into long-term memory (if the project has a memory system):

- [ ] Vercel CLI deploys for a `rootDirectory`-scoped project must run from the directory
  the project is *linked from* (usually the repo root), not the subfolder itself.
- [ ] When copying another Vercel project's deploy shape, verify its `.vercel/
  project.json` location on disk — don't infer the CLI invocation directory from
  `rootDirectory` alone.
