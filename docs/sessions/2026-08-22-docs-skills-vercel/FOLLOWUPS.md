# Follow-ups — Skills Catalog, README/site positioning, GitHub Pages → Vercel (2026-08-22)

## Blocked on the user (decisions / approvals / access)

- [ ] Decide whether to fully disable the old GitHub Pages site
      (`catesandrew.github.io/mcp-agent-bridge/`) via repo Settings → Pages, or leave it as
      a frozen, unlinked snapshot indefinitely (current state — see ADR 0001).

## Blocked on work (do next)

- [ ] Push the trailing commit `ca37f2b` (lockfile + progress.txt) to `origin/main` if not
      already done — zero functional risk, just hasn't been pushed yet. `mcp-agent-bridge`
      repo root.

## Nice-to-have / later

- [ ] If a second Claude Code skill is ever added under `skills/<name>/`, add its row to
      `website/docs/skills/index.md`'s table and its own deep-dive page, following the
      `dual-review.md` pattern.
- [ ] Consider adding a real Vercel *preview* deploy step to any future infra change on
      this project now that the first-deploy-collapses-to-production quirk is known (see
      `../LESSONS.md`) — e.g. seed a throwaway prod deploy first if a genuine
      pre-production checkpoint is needed again.

## Known risks / watch-outs

- Vercel git auto-deploy is now connected and *proven* (a follow-up push auto-built), but
  it's the only test so far — if a future push doesn't deploy, check the project's `link`
  field via the Vercel API before assuming the workflow itself is broken.
- The Skills Catalog table currently has exactly one row (`dual-review`) by design, not
  omission — don't "fix" it by inventing filler rows.

## Done this session (for reference)

- [x] Skills Catalog section shipped (`website/docs/skills/index.md`,
      `website/docs/skills/dual-review.md`) (`472d3fb`)
- [x] README rewritten with sharper hook + Claude Code Skills install section (`472d3fb`,
      `58621d5`)
- [x] Stale "16 vs 18" resume-tool count fixed across 3 files (`472d3fb`)
- [x] Docs site migrated from GitHub Pages to Vercel, live at
      `https://mcp-agent-bridge.catesworks.dev` (`472d3fb`)
- [x] Cloudflare CNAME + Vercel domain attachment, both verified live
- [x] GitHub auto-deploy connected and proven with a real follow-up push (`58621d5`)
- [x] 73/73 tests still passing, `pnpm build` clean, independent architect verification
      passed (post two rounds of real fixes)
