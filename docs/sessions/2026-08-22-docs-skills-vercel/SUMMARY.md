# Summary — Skills Catalog, README/site positioning, GitHub Pages → Vercel (2026-08-22)

## Goal

Make the repo quick to grok for a new visitor: what it does, how to run it, where the
setup instructions live — plus document the Claude Code skills the repo ships as a real
Skills Catalog, and move the docs site off GitHub Pages onto Vercel at
`mcp-agent-bridge.catesworks.dev`.

## What was done

### Planning (consensus review before any code)

- Wrote `.omc/plans/2026-08-22-docs-skills-catalog-vercel.md` and ran it through 3 rounds
  of Architect + Critic review (RALPLAN-DR) before implementing. Caught 6 real issues
  pre-execution: a GitHub Pages/Vercel dual-host regression window, a dead link to a page
  being deleted, a false "identical to sibling project" Vercel-deploy-parity claim, a
  stale "16 vs actual-18" resume-tool count, a mis-transcribed fact about the sibling
  Vercel project's `rootDirectory` setting, and a CLI-cwd-vs-`rootDirectory` conflict in
  the fix for that.

### Skills Catalog (mcp-agent-bridge)

- `website/docs/skills/index.md` (new) — catalog table + explanation of the two
  distribution channels every skill ships through (Claude Code plugin marketplace `mab`,
  npm package).
- `website/docs/skills/dual-review.md` (new) — deep-dive: what it does, why it exists
  (traced to `SPEC.md`'s original design + commits `3c12bac`/`0aac0a7`/`bf7279b`), verified
  install methods, usage/config.
- `website/docs/guides/dual-review-skill.md` — deleted (superseded).
- `website/docs/guides/cross-agent-review.md` — retargeted its link to the new page.
- `website/sidebars.ts`, `website/docusaurus.config.ts` — new "Skills" sidebar category +
  navbar link.
- Commit: `472d3fb`.

### README / positioning (mcp-agent-bridge)

- `README.md` — rewrote the opening hook (leads with the actual pain point — tab-switching
  between agents for a second opinion — instead of architecture); added a "Claude Code
  Skills" section with `<details>` install blocks (Claude Code plugin, npm, manual clone),
  modeled on GoogleChrome/modern-web-guidance's README; swapped every
  `catesandrew.github.io` link to the new Vercel domain.
- Fixed a pre-existing stale "16 resume tools" count (actual is 18, confirmed by counting
  the table rows) across `README.md`, `SKILLS.md`, `website/docs/guides/resume-tools.md`.
- `website/docs/intro.md`, `website/src/pages/index.tsx` — copy-only rewrite of the
  homepage/intro hook, reusing existing components.
- Commits: `472d3fb`, `58621d5` (a follow-up deslop fix for a redundant phrase).

### GitHub Pages → Vercel migration (mcp-agent-bridge)

- `website/docusaurus.config.ts` — `url` → `https://mcp-agent-bridge.catesworks.dev`,
  `baseUrl` → `/`.
- `.github/workflows/deploy-docs.yml` — deleted in the **same commit** as the config flip,
  so no push could ever ship the new `baseUrl` against a still-active Pages workflow.
- Real infra provisioned and verified live:
  - Vercel project `mcp-agent-bridge-docs` (`prj_zP9mOFRF8hS6qHdFGGGL2JF9n8uy`), linked from
    the repo root with `rootDirectory: "website"` and `framework: "docusaurus-2"` both set
    explicitly.
  - Cloudflare CNAME `mcp-agent-bridge.catesworks.dev → cname.vercel-dns.com`
    (`proxied: false`), zone `415915fe552bf40468180bd39d95b92f`, matching the existing
    `lighthouse-fleet`/`next-starters` pattern.
  - GitHub auto-deploy connected via `vercel git connect <url>` after an initial
    ambiguous-remote failure; proven working by pushing `58621d5` and watching Vercel
    build it automatically.
- Old `catesandrew.github.io/mcp-agent-bridge/` remains live but frozen (last snapshot,
  unlinked from anywhere in the repo) — not disabled; see FOLLOWUPS.md.

## Verification

- `cd website && pnpm build` — exit 0, `onBrokenLinks: "throw"` still set, no broken
  links (re-run twice: once after content changes, once after the deslop fix).
- `pnpm test` at repo root — 73/73 tests passed, unaffected as expected (docs-only change).
- `pnpm lint` (`tsc --noEmit`) — clean.
- Live checks: `curl -sI https://mcp-agent-bridge.catesworks.dev/` and
  `/docs/skills` and `/docs/skills/dual-review` — all HTTP 200.
- `grep -rn "catesandrew.github.io"` and `grep -rn "16 resume\|16 career\|16 tools"` across
  the repo — both zero hits.
- Independent architect verification (not self-approved) ran twice: once against the plan
  before implementation (3 rounds), once against the finished PRD after implementation —
  caught 2 real post-implementation gaps (see LESSONS.md), both fixed and re-verified.
- Not verified: the MSI/Windows installer work referenced earlier in `progress.txt` is
  unrelated to this session and remains in its prior state.

## Commits

| SHA | Repo | Message | Pushed? |
|-----|------|---------|---------|
| `472d3fb` | mcp-agent-bridge | docs: Skills Catalog, sharper README/site positioning, move docs to Vercel | yes |
| `58621d5` | mcp-agent-bridge | docs: tighten redundant phrasing in README hook | yes |
| `ca37f2b` | mcp-agent-bridge | chore: update lockfile, record docs/Vercel migration session in progress.txt | pending |

## Out of scope / deferred

- The 18 resume/career MCP tools (`SKILLS.md`) were explicitly kept out of the Skills
  Catalog itself (user decision, confirmed via AskUserQuestion this session) — only the
  stale count was fixed, not a rewrite of that catalog.
- Disabling the old GitHub Pages site in repo settings — optional, manual, not done (see
  FOLLOWUPS.md).
