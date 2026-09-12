# Make mcp-agent-bridge easy to grok: docs site, Skills Catalog, README, Vercel deploy

Status: APPROVED (revision 2, final). Round 1: REJECT, 4 findings, fixed. Round 2: Architect found 1 more (rootDirectory mis-transcription, fixed), then Critic found that fix conflicted with CLI cwd (fixed — deploy runs from repo root). Round 3: Architect found a missing explicit `framework` override (fixed), Critic APPROVED. Ready for execution.

Two minor non-blocking notes from final approval, for the executor to keep in mind (not required plan edits):
- Step 2's `vercel link --yes --project mcp-agent-bridge-docs` is expected to create the project on
  first run since it doesn't exist yet; if `vercel link` instead errors looking for an existing
  project, create it explicitly first via `POST /v10/projects` with the same name before retrying.
- `.claude-plugin/marketplace.json`'s auto-generated description field reads "1 skills" (grammar
  bug in the generator, not this plan's doing) — don't quote it verbatim on the Skills Catalog page.

## Context

Repo works but is hard to size up: README leads with architecture instead of the hook, the
Docusaurus site (`website/`) exists but is thin (getting-started/guides/api/deployment only,
GitHub Pages branded), and the one distributable Claude Code skill (`dual-review`, a published
npm package `@mcp-agent-bridge/skill-dual-review@1.0.0` plus a Claude Code plugin marketplace at
`.claude-plugin/marketplace.json`) has zero visibility in the README and only a thin usage guide
on the site — no story for *why* it exists or how to install it.

Goal: someone landing on the repo or the docs site in 60 seconds should know what this is, how to
run it, and how to grab the dual-review skill. Ship a real Skills Catalog (table + one deep page
per skill), sharpen the README with confident positioning + an "Alternative Installation Methods"
section (pattern from GoogleChrome/modern-web-guidance), and move the docs site to
`mcp-agent-bridge.catesworks.dev` on Vercel.

User-confirmed scope (already asked via AskUserQuestion this session):
- Skills Catalog = Claude Code skills only (dual-review + future `packages/skill-*`), NOT the 18
  resume/career MCP tools already covered by `SKILLS.md`.
- Deploy for real: use `VERCEL_ACCESS_TOKEN` (env) and Cloudflare creds from `../.envrc` (env via
  direnv) — both already verified live against the real APIs during research (see Evidence).

## Evidence gathered (facts, not assumptions)

- `@mcp-agent-bridge/skill-dual-review` is live on npm registry: version `1.0.0`, dist-tag
  `latest` (verified via `registry.npmjs.org` API call).
- Cloudflare zone `catesworks.dev` = `415915fe552bf40468180bd39d95b92f`. Existing sibling pattern:
  `CNAME <subdomain>.catesworks.dev -> cname.vercel-dns.com`, `proxied: false` — used by
  `lighthouse-fleet` and `next-starters`. Root domain already has Vercel Domain Connect wired
  (`_domainconnect.catesworks.dev -> _domainconnect.vercel-dns.com`), so a new subdomain add
  should need no extra TXT verification.
- Vercel project `next-starters-docs` (sibling docs site, same repo owner) is
  `framework: docusaurus-2` with `rootDirectory: "website"` explicitly set (re-verified via API —
  an earlier read of this project mis-transcribed it as "no rootDirectory override"; corrected
  here). Confirmed on disk: `next-starters/.vercel/project.json` exists at the **repo root**;
  `next-starters/website/.vercel/` does **not** exist. So the sibling is linked and deployed
  **from the repo root**, with the `rootDirectory` project setting telling Vercel which subfolder
  to actually build — not by `cd`-ing into `website/` first. That matters here too: this repo's
  root `pnpm-workspace.yaml` only declares `packages/skill-*` as workspace members — `website/` is
  not one — and the root `package.json`'s `build` script is `tsc` (the MCP bridge itself), not
  Docusaurus. `rootDirectory: "website"` is exactly what makes Vercel bypass both of those and
  build the Docusaurus site instead; running the CLI from *inside* `website/` while also setting
  `rootDirectory: "website"` would make Vercel look for `website/website/`, which doesn't exist.
  `website/package.json` here is already named `mcp-agent-bridge-docs`, matching Vercel's own
  project-naming convention.
- `.claude-plugin/marketplace.json`: marketplace name `mcp-agent-bridge`, one plugin `mab` with
  skill `./skills/dual-review` — so the real install commands are
  `/plugin marketplace add catesandrew/mcp-agent-bridge` + `/plugin install mab@mcp-agent-bridge`.
- Git history for *why* dual-review exists: born in `SPEC.md`'s original design (give a second AI
  a plan/diff via the `claude_reviewer`/`codex` MCP tools before and after implementing), then
  productized 8 days later via commits `3c12bac` (scaffold multi-channel skill distribution
  infra), `0aac0a7` (metadata.json, package validated), `bf7279b` (enabled for npm publish) — a
  documented three-step turn from "repo-local skill" to "installable package."
- Existing `website/docs/guides/dual-review-skill.md` duplicates what the new deep-dive page
  should own — must be replaced, not left alongside, or the site ships two conflicting sources of
  truth for the same skill. `website/docs/guides/cross-agent-review.md:90` links to it
  (`[Dual-Review Skill](./dual-review-skill)`) and must be retargeted to `/docs/skills/dual-review`
  or the `onBrokenLinks: "throw"` build fails.
- `.github/workflows/deploy-docs.yml` (confirmed real, currently active) builds `website/` and
  publishes it to GitHub Pages on every push to `main` that touches `website/**`. This repo's
  content changes all live under `website/`, so the very next merge after this change would fire
  it. Since `docusaurus.config.ts`'s `baseUrl` is changing from `/mcp-agent-bridge/` to `/`, an
  actual Pages redeploy after that change would publish asset paths built for the wrong base —
  broken site at the old URL. Decision: **retire GitHub Pages entirely** in the same commit as the
  domain cutover — delete `deploy-docs.yml`. Vercel becomes the single canonical host (matches
  Principle 3, one source of truth, applied to *hosting* not just skill docs). The last
  Pages-published snapshot at the old URL stays live (GitHub Pages doesn't un-publish on its own)
  but is frozen and self-consistent — not actively broken, just stale — which is acceptable since
  every link to it is also being updated in this same change.
- Sibling `next-starters-docs`'s actual `website/` (`/Volumes/dev-ssd/repos/personal/next-starters/website/`)
  runs `pnpm@10.33.0` with `pnpm-workspace.yaml: {packages: ['.']}`. This repo's `website/`
  (confirmed via `cat`) runs `pnpm@11.6.0` with a `pnpm-workspace.yaml` that declares only
  `allowBuilds` — no `packages:` key. The deploy shape is *similar* (Vercel CLI linked/run from the
  repo root, `rootDirectory: "website"` + `framework: "docusaurus-2"` both set explicitly rather
  than relying on auto-detection — see Deploy step 3 — no `vercel.json`), not proven identical —
  the pnpm 11 + no-`packages:`-key combination has not actually been exercised on
  Vercel's build image before. Mitigation: run a preview deploy first and confirm it builds clean
  before promoting to production (see Deploy section, now reordered and corrected to run from the
  repo root rather than from inside `website/`).
- Confirmed via grep: `SKILLS.md`'s own table lists **18** resume/career tools, but the prose says
  **16** in `SKILLS.md:3`, `README.md:61,62,63,67`, and `website/docs/guides/resume-tools.md:7,272`
  — a pre-existing stale count from before `career_fact_extractor` and
  `recruiter_first_screen_simulation` were added (commit `ddaa915`). Not new scope: this is an
  accuracy fix incidental to the README/positioning pass already touching those lines, not a
  re-opening of the "resume tools are out of scope for the Skills Catalog" decision (that decision
  stands — this only fixes a wrong number in prose that already exists).

## RALPLAN-DR Summary (short mode)

### Principles
1. Ship only verified claims — every install command and "why it exists" statement must trace to
   a real API check or a real git commit, not invented backstory or unpublished channels.
2. Reuse existing structure over inventing new ones — sidebar categories, the existing feature-grid
   homepage component, and the sibling Vercel project's deploy shape all get reused where they
   actually match; where the sibling differs (pnpm version, workspace config), verify empirically
   via a preview deploy instead of assuming parity.
3. One source of truth per skill — the new Skills Catalog deep-dive page replaces (not
   duplicates) the existing dual-review guide.
4. Scope discipline — resume/career MCP tools (`SKILLS.md`) stay out of the Skills Catalog per
   explicit user decision; don't creep back into "document everything."
5. Deploy for real, verify for real — a `vercel --prod` exit code 0 is not "done"; the domain must
   actually resolve before this is reported complete.

### Decision Drivers (top 3)
1. **Time-to-understanding for a new visitor** — the README/homepage hook and the Skills Catalog
   table are the highest-leverage content changes; everything else is secondary polish.
2. **Accuracy over ambition** — the Skills Catalog currently has exactly one entry; the catalog
   structure must look intentional with one row, not padded or apologetic about only having one.
3. **Low-risk, reversible infra** — new Vercel project + one new DNS CNAME, matching an existing
   proven pattern in the same Cloudflare zone/Vercel account, not a novel deployment shape.

### Viable Options

**Option A — Full plan as scoped (recommended):** New Skills Catalog section (index + one
deep-dive page, replacing the old guide), README rewrite with hook + Alternative Installation
Methods block for the skill, marketing-copy pass on `intro.md`/homepage (copy only, no new
components), config/domain switch to Vercel, and a real Vercel+Cloudflare deploy matching the
sibling project's shape.
- Pros: Directly answers all three original questions ("how do I use it / how does it run / where
  are the setup instructions") in the two highest-traffic surfaces (README, homepage); reuses
  proven infra pattern so deploy risk is low; keeps scope bounded to what was actually asked.
- Cons: Touches README + 6 site files + live infra in one pass — larger single review surface
  than doing docs-only first.

**Option B — Docs/README only this pass, defer the Vercel/Cloudflare deploy to a follow-up
request:** Same content changes, but stop short of provisioning real infra; leave the site
building correctly for a manual `vercel` run later.
- Pros: Zero external side effects; nothing to roll back if content needs another revision round.
- Cons: Directly contradicts the user's explicit instruction this session to deploy now using the
  already-available tokens — would be re-litigating a decision already made, not a genuine
  alternative.

**Invalidation rationale for Option B:** the user was already asked (via AskUserQuestion, this
session) exactly how far to take the Vercel deploy, and explicitly answered "deploy for real using
these tokens." Re-deferring that in this plan would ignore direct, current instruction — Option B
is listed for completeness of the RALPLAN-DR format, not as a genuine contender.

**Recommendation:** Option A.

## Content changes (Option A)

### 1. Skills Catalog (new Docusaurus section)
- `website/docs/skills/index.md` — table (name, purpose, use case), one row today (`dual-review`),
  written so a second `packages/skill-*` is just another row + page later. Explain the two
  distribution channels every skill here ships through (Claude Code plugin marketplace `mab`,
  standalone npm package), sourced from `.github/workflows/skills-release.yml` and `bin/*.mjs`.
- `website/docs/skills/dual-review.md` — replaces `website/docs/guides/dual-review-skill.md`
  (delete). Covers: what it does (from `packages/skill-dual-review/SKILL.md`), why it exists (git
  history above), install (Claude Code plugin, npm, manual clone — all verified real), usage/
  config/iteration rules (carried over, still accurate).
- `website/sidebars.ts` — add `Skills` category (`skills/index`, `skills/dual-review`) between
  `Guides` and `Deployment`; remove `guides/dual-review-skill` from `Guides`.
- `website/docusaurus.config.ts` navbar — add a `Skills Catalog` top-level link (`/docs/skills`).

### 2. Marketing / positioning pass
- `website/docusaurus.config.ts`: `url` → `https://mcp-agent-bridge.catesworks.dev`, `baseUrl` →
  `/`. Sharpen `tagline`.
- `website/docs/intro.md`, `website/src/pages/index.tsx`: lead with the pain (copy-pasting diffs
  between agent tabs for a second opinion) before architecture. Copy only — reuse the existing
  feature-grid component, no new visual components/assets.
- `README.md`: rewrite opening (title → hook → "Why?"); add a **Claude Code Skills** section
  (currently absent) with an Alternative-Installation-Methods-style `<details>` block per channel
  (Claude Code Plugin, npm, manual/clone), linking to the new Skills Catalog page; swap every
  `catesandrew.github.io/mcp-agent-bridge` link to `https://mcp-agent-bridge.catesworks.dev`.
  Leave Resume & Career Tools / Installation / Configuration / Security sections as-is (out of
  scope, already solid).

### Files touched
`website/docusaurus.config.ts`, `website/sidebars.ts`, `website/docs/skills/index.md` (new),
`website/docs/skills/dual-review.md` (new), `website/docs/guides/dual-review-skill.md` (delete),
`website/docs/guides/cross-agent-review.md` (retarget one link),
`.github/workflows/deploy-docs.yml` (delete — GitHub Pages retirement),
`website/docs/intro.md`, `website/src/pages/index.tsx`, `README.md` (positioning + stale-count
fix), `SKILLS.md` (stale-count fix), `website/docs/guides/resume-tools.md` (stale-count fix).

## Deploy to Vercel + Cloudflare

Two independent axes, not one sequence: (a) *local file state* (config flip + Pages-workflow
deletion must be edited together, since the Vercel build itself needs the corrected `baseUrl`) vs
(b) *when it's pushed to git* (must not push the `baseUrl` flip while `deploy-docs.yml` still
exists, or the next Pages build ships broken asset paths at the old URL). Vercel CLI deploys read
local disk state directly — they do not require a git push first.

1. Make all content edits (Skills Catalog, README, positioning copy, stale-count fixes) **and**
   the `docusaurus.config.ts` `url`/`baseUrl` flip **and** the `deploy-docs.yml` deletion together,
   before any deploy — the Vercel build must run against the *final* config, not a partial one.
2. From the **repo root** (`/Volumes/dev-ssd/repos/personal/mcp-agent-bridge`, not `website/` —
   see Evidence: the sibling links/deploys from its repo root and lets `rootDirectory` point at
   the subfolder; running from inside `website/` while also setting `rootDirectory: "website"`
   would make Vercel look for a nonexistent `website/website/`):
   `vercel link --yes --token "$VERCEL_ACCESS_TOKEN" --project mcp-agent-bridge-docs`.
3. `PATCH /v9/projects/mcp-agent-bridge-docs` `{"rootDirectory": "website", "framework": "docusaurus-2"}`
   — both required before any deploy is trusted to build the right thing. `rootDirectory` alone
   isn't enough: linking from the repo root means Vercel's own auto-detection sees the repo root's
   `package.json` (`build: tsc`, the MCP bridge itself) at project-creation time, not
   `website/package.json` — an undetected/`null` framework defaults its output directory to
   `public/`, not Docusaurus's `build/`, which would deploy a 404 site with no build error to catch
   it. Setting `framework` explicitly removes that ambiguity, matching the sibling's confirmed
   `framework: docusaurus-2`.
4. Attempt GitHub repo connection (`catesandrew/mcp-agent-bridge`) for auto-deploy-on-push, same
   as `next-starters-docs`. If the git-link step fails, fall back to CLI-only deploys and report
   that honestly — not a blocker. If it succeeds, its actual build is only verified later, at
   step 11, once the real push happens — a git-triggered deploy is a distinct path from the CLI
   deploys in steps 5–6 and isn't exercised by them.
5. **Preview deploy first**, from the repo root (same cwd as step 2, `rootDirectory` already set):
   `vercel --token "$VERCEL_ACCESS_TOKEN" --yes` (no `--prod`). This is the actual test of pnpm
   11.6.0 + no-`packages:`-key building on Vercel's image via the `rootDirectory` override — not
   assumed from the sibling project. Confirm the preview URL returns 200 and the Skills Catalog
   page renders before proceeding.
6. Promote to production, from the repo root: `vercel --prod --token "$VERCEL_ACCESS_TOKEN" --yes`.
7. `POST /v10/projects/mcp-agent-bridge-docs/domains` `{"name": "mcp-agent-bridge.catesworks.dev"}`.
8. Cloudflare: create `CNAME mcp-agent-bridge.catesworks.dev -> cname.vercel-dns.com`,
   `proxied: false`, zone `415915fe552bf40468180bd39d95b92f` — same DNS/domain-attachment shape as
   `lighthouse-fleet`/`next-starters` (that part of the pattern is proven; build-image compatibility
   is what step 5 actually tests, not assumed).
9. Verify the new domain resolves to a real 200.
10. Only once 5–9 are confirmed working, commit and push all the file changes (including the
    `deploy-docs.yml` deletion) as one commit. Because the workflow is deleted in that same commit,
    the push cannot trigger a broken Pages rebuild — there's nothing left to run it. If step 5's
    preview deploy had failed instead, the local `deploy-docs.yml` deletion would simply not be
    pushed yet, so Pages keeps serving its last-known-good snapshot with no regression either way.
11. If step 4's git-link succeeded, this push (step 10) is its first real trigger — separately
    confirm that git-triggered deployment also returns 200 (via `vercel ls` or the Vercel
    dashboard/API), since it's a distinct build path from the CLI deploys in steps 5–6, correctly
    scoped by step 3's `rootDirectory` setting but not yet itself observed to succeed.
12. Report the frozen old GitHub Pages URL's fate explicitly (last snapshot stays live, un-linked,
    not actively maintained) rather than implying it was cleanly decommissioned.

## Acceptance Criteria (testable)
- [ ] `pnpm build` inside `website/` exits 0 with `onBrokenLinks: "throw"` still set (catches any
      dangling link from the guide deletion / sidebar changes).
- [ ] `website/docs/skills/index.md` renders a table with at least the `dual-review` row and links
      to `website/docs/skills/dual-review.md`.
- [ ] `website/docs/guides/dual-review-skill.md` no longer exists; no remaining references to it
      anywhere in `website/docs/` or `sidebars.ts` — specifically
      `website/docs/guides/cross-agent-review.md:90` now links `/docs/skills/dual-review`.
- [ ] `README.md` contains a "Claude Code Skills" heading with at least 3 `<details>` install
      blocks (Claude Code plugin, npm, manual) and zero remaining
      `catesandrew.github.io/mcp-agent-bridge` links (grep confirms 0 across the whole repo).
- [ ] Zero occurrences of "16 resume" / "16 career" / "16 tools" remain in `SKILLS.md`,
      `README.md`, and `website/docs/guides/resume-tools.md` — all say 18, matching the actual
      18-row tables already in those files.
- [ ] `.github/workflows/deploy-docs.yml` no longer exists in the repo, and its deletion landed in
      the same commit as `docusaurus.config.ts`'s `url`/`baseUrl` change (check the commit diff).
- [ ] `website/docusaurus.config.ts` `url` is `https://mcp-agent-bridge.catesworks.dev`.
- [ ] Vercel project `mcp-agent-bridge-docs` has `rootDirectory: "website"` AND
      `framework: "docusaurus-2"` set (verify via `GET /v9/projects/mcp-agent-bridge-docs`) before
      any deploy or git-link is trusted for auto-deploy.
- [ ] A Vercel preview deployment (step 5 of Deploy) returned 200 with the Skills Catalog page
      present, checked *before* the production promotion ran.
- [ ] If git-link (step 4) succeeded, the resulting git-triggered deployment (step 11) also
      returned 200 — checked separately from the CLI preview/prod deploys, since it's a distinct
      build path.
- [ ] `curl -sI https://mcp-agent-bridge.catesworks.dev` returns HTTP 200 (or a documented "DNS
      still propagating, verified via Cloudflare/Vercel API that the records are correctly
      configured" fallback if propagation hasn't finished).
- [ ] Cloudflare zone `415915fe552bf40468180bd39d95b92f` has a `CNAME mcp-agent-bridge` record
      pointing to `cname.vercel-dns.com` with `proxied: false`.
- [ ] Vercel project `mcp-agent-bridge-docs` exists with domain `mcp-agent-bridge.catesworks.dev`
      attached.

## Risks and Mitigations
- **Broken internal links after deleting the old guide** → `onBrokenLinks: "throw"` in
  `docusaurus.config.ts` already fails the build on this; `cross-agent-review.md:90` is explicitly
  retargeted rather than relying on the build catch alone.
- **Pages/Vercel dual-host regression window** → config flip and `deploy-docs.yml` deletion are
  edited together and pushed together, only after the Vercel deploy is independently verified live
  (see reordered Deploy section) — no push ever ships a `baseUrl` change while Pages could still
  rebuild against it.
- **pnpm 11.6.0 / missing `packages:` key unproven on Vercel's build image** → no longer assumed
  identical to the sibling; a real preview deploy (step 5) is the actual test, checked before
  production promotion.
- **Vercel git-link step fails (GitHub App scope/permissions)** → fall back to CLI-only deploy,
  note it explicitly in the final report; not a hard blocker for having the site live.
- **DNS/TLS propagation lag** → verify via both the Cloudflare API (record created) and Vercel API
  (domain attached, certificate status) even if the live curl hasn't gone green yet; don't claim
  "done" on an unverified guess either way.
- **Overclaiming skill history/"why"** → every "why it exists" sentence in `skills/dual-review.md`
  must map to a cited commit hash or `SPEC.md` section already gathered above — no invented
  narrative.
- **Rollback**: if the preview deploy (step 5) fails, nothing has been pushed or DNS-changed yet —
  fix locally and retry. If a problem is found only after production + DNS + the final push, revert
  is a single `git revert` of the one bundled commit (content + config + workflow deletion travel
  together) plus deleting the Cloudflare CNAME and Vercel domain attachment; GitHub Pages was never
  actively broken in the interim, so reverting fully restores the pre-change state.

## Verification Steps
1. `cd website && pnpm install && pnpm build` — must exit 0.
2. Re-read final `README.md` and `website/docs/skills/*.md` against the Evidence section above —
   confirm no unverified install command or invented history made it in.
3. `grep -rn "catesandrew.github.io"` and `grep -rn "16 resume\|16 career\|16 tools"` across the
   repo — both must return zero results.
4. Re-run the Cloudflare DNS-record GET and Vercel project/domain GET after the deploy steps to
   confirm the created state matches what was intended (not just that the create calls returned
   2xx).
5. `curl -sI https://mcp-agent-bridge.catesworks.dev` for a live status check at the end.

## ADR: Retire GitHub Pages, adopt Vercel as sole docs host

- **Decision**: Delete `.github/workflows/deploy-docs.yml` and point `docusaurus.config.ts` at
  `https://mcp-agent-bridge.catesworks.dev` (Vercel), rather than keeping GitHub Pages as a
  secondary/mirror host.
- **Drivers**: One source of truth for docs hosting (Principle 3, extended from skill-docs to
  hosting); the sibling `next-starters-docs`/Cloudflare-zone pattern already proves the *DNS and
  domain-attachment* shape works within this account/zone (CNAME → `cname.vercel-dns.com`,
  `proxied: false`) and the *project-config* shape (`rootDirectory: "website"`,
  `framework: "docusaurus-2"`, linked from the repo root) — only the *build-image* compatibility
  (pnpm 11.6.0, no `packages:` key, vs. the sibling's pnpm 10.33.0) is new and unproven, which is
  why it gets its own preview-deploy
  checkpoint rather than being assumed; avoiding a permanent dual-maintenance burden of two doc
  hosts with diverging `baseUrl` requirements.
- **Alternatives considered**: (a) keep both hosts live, Pages as a redirect-only mirror — rejected
  because Pages has no clean same-repo redirect mechanism to a Vercel domain without extra tooling
  (`@docusaurus/plugin-client-redirects` isn't installed) and would need permanent upkeep for no
  real benefit; (b) defer the Pages retirement to a separate follow-up change — rejected because it
  reopens exactly the regression window (broken `baseUrl` shipped to an still-active Pages
  workflow) that this revision exists to close.
- **Why chosen**: Retiring Pages atomically with the config flip is the only option that is both
  correct (no window where either host is broken) and low-maintenance going forward.
- **Consequences**: The last-published Pages snapshot at `catesandrew.github.io/mcp-agent-bridge/`
  remains reachable indefinitely (GitHub Pages doesn't auto-unpublish) but frozen and unlinked from
  anywhere in the repo after this change — acceptable staleness, not an active break.
- **Follow-ups**: If GitHub Pages should be fully unpublished (not just stop-updating), that's a
  one-time repo-settings change (Settings → Pages → disable) outside this plan's file-based scope —
  flag it to the user as an optional manual cleanup step, don't do it silently.

## Changelog (Architect + Critic round 1 → revision 1)
- Added `.github/workflows/deploy-docs.yml` retirement, sequenced to close the dual-host regression
  window Critic marked Critical (was entirely missing from the draft).
- Added `website/docs/guides/cross-agent-review.md` to Files touched / Acceptance Criteria (dead
  link to the deleted guide, confirmed via grep, was previously unlisted).
- Replaced the false "identical to the sibling" deploy-parity claim with an explicit preview-deploy
  verification step, after confirming the sibling's actual pnpm version/workspace config differs.
- Added the pre-existing "16 vs actual-18" resume-tool stale count fix to the README/SKILLS.md
  touch list as an accuracy correction (not new scope — the decision to keep resume tools out of
  the Skills Catalog itself is unchanged).
- Fixed a sequencing bug introduced during the round-1 revision itself: the config `baseUrl` flip
  must happen before the Vercel build (not after, as first drafted), since Vercel needs the correct
  value too — only the *push* of that change needs to wait for live verification, not the edit.
- Added ADR and rollback note.

### Round 2 (Architect re-review)
- Corrected a mis-transcribed fact from the original research: sibling project `next-starters-docs`
  DOES set `rootDirectory: "website"` explicitly (re-verified via API) — round-1's Evidence
  section had wrongly claimed "no rootDirectory override." Without this setting, a git-linked
  deploy of this repo would build the wrong thing (root `pnpm-workspace.yaml` excludes `website/`;
  root `build` script is `tsc`, the MCP bridge itself, not Docusaurus).
- Added a `PATCH /v9/projects/.../{"rootDirectory": "website"}` step before the git-link attempt,
  plus an AC to verify it's actually set, plus a separate AC/step (11) to confirm the git-triggered
  deploy path also succeeds once it's live — it's a distinct build path from the CLI preview/prod
  deploys and was previously left unverified even though everything else in the sequence was.
- Reworded the ADR's "Drivers" bullet: the proven-vs-unproven split is DNS/domain-attachment shape
  (proven, sibling pattern) vs. build-image compatibility (unproven, pnpm 11 vs sibling's pnpm 10)
  — the original wording implied the whole Vercel shape was proven, which round 1 had already
  retracted elsewhere in the same plan (inconsistency flagged by Architect round 2).

### Round 2 (Critic re-review) — CRITICAL fix
- Critic caught that the round-2 Architect fix (`PATCH .../{"rootDirectory": "website"}`) had been
  bolted onto a CLI sequence that still ran `vercel link`/`vercel`/`vercel --prod` from *inside*
  `website/` — combined with `rootDirectory: "website"`, that makes Vercel look for a nonexistent
  `website/website/` and the deploy would simply fail. Verified on disk:
  `next-starters/.vercel/project.json` exists at that sibling repo's **root**;
  `next-starters/website/.vercel/` doesn't exist — confirming the sibling links/deploys from its
  repo root, not from inside its `website/` folder. Fixed: steps 2, 5, 6 now explicitly run from
  the repo root; the Evidence section's description of the sibling's shape corrected to match.
- Fixed two dangling step references left over from the round-1 renumbering (`(see step 8a)` with
  no such step; `preview deploy (step 4)` when preview is step 5) — all step cross-references
  re-checked end-to-end after this pass.

### Round 3 (Architect final check) — PASS with one fix applied
- Architect verified the repo-root fix is internally consistent everywhere (Evidence, steps,
  AC, Risks, Rollback, ADR, Changelog) and found no dangling references, but flagged that
  `rootDirectory` alone doesn't guarantee a Docusaurus build: linking from the repo root means
  Vercel's framework auto-detection would see the root `package.json` (`build: tsc`) at
  project-creation time, not `website/package.json` — an undetected/`null` framework defaults to
  serving `public/`, not Docusaurus's `build/`, deploying a silent 404 site with no build error.
- Fixed: step 3's PATCH now also sets `"framework": "docusaurus-2"` explicitly (matching the
  sibling's confirmed value), with a matching AC. Also fixed a minor ADR miscategorization that had
  listed `rootDirectory` under the "proven DNS shape" driver instead of the "proven project-config
  shape" driver, and removed a leftover "framework auto-detected" phrase in the Evidence section
  that predated this fix.
