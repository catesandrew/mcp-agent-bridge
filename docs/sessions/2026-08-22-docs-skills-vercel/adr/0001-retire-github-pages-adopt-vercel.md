# ADR 0001: Retire GitHub Pages, adopt Vercel as sole docs host

- **Status:** accepted
- **Date:** 2026-08-22
- **Deciders:** repo owner (via direct instruction this session)

## Context

The docs site (`website/`, Docusaurus) was hosted on GitHub Pages at
`catesandrew.github.io/mcp-agent-bridge/`, auto-deployed by
`.github/workflows/deploy-docs.yml` on every push touching `website/**`. The repo owner
wanted the site moved to a custom subdomain, `mcp-agent-bridge.catesworks.dev`, on Vercel
(matching an existing sibling project, `next-starters-docs` /
`next-starters.catesworks.dev`, in the same account and Cloudflare zone). Simply flipping
`docusaurus.config.ts`'s `url`/`baseUrl` to the new domain, without also touching the Pages
workflow, would leave that workflow active and firing on the very next `website/**` push —
republishing the old GitHub Pages URL with asset paths built for the *new* `baseUrl`,
breaking it.

## Options considered

1. **Keep both hosts live, Pages as a mirror** — Vercel becomes canonical, Pages keeps
   auto-deploying as a redirect-only mirror. Pros: old links technically still resolve to
   *something*. Cons: no clean same-repo redirect mechanism to a different domain exists in
   this Docusaurus setup (`@docusaurus/plugin-client-redirects` isn't installed); permanent
   dual-maintenance burden for a mirror with no real audience.
2. **Defer the Pages retirement to a separate follow-up change** — flip the domain now,
   delete the workflow later. Cons: reopens exactly the regression window this decision
   exists to close — a `website/**` push in between the two changes would break the old
   Pages site.
3. **Retire GitHub Pages entirely, in the same commit as the domain flip** — delete
   `deploy-docs.yml` atomically with the `url`/`baseUrl` change.

## Decision

Option 3. Delete `.github/workflows/deploy-docs.yml` in the same commit as
`docusaurus.config.ts`'s `url`/`baseUrl` change, and only push that combined commit after
independently verifying the new Vercel deployment is live. **Because** it's the only option
that is both correct (no window where either host serves a broken build) and
low-maintenance going forward — one canonical host, no redirect infrastructure to build or
maintain.

## Consequences

- **Positive:** One source of truth for docs hosting going forward; no ongoing
  dual-host maintenance; the ordering guarantee (edit together, push only after live
  verification) means no regression window ever existed in practice.
- **Negative / cost:** The last-published Pages snapshot at
  `catesandrew.github.io/mcp-agent-bridge/` remains reachable indefinitely — GitHub Pages
  doesn't auto-unpublish when its workflow is removed — frozen and unlinked from anywhere
  in the repo, but not actively decommissioned.
- **Follow-on:** Fully unpublishing the old Pages site (not just stopping updates to it) is
  a one-time manual step (repo Settings → Pages → disable), outside this change's file-based
  scope. See FOLLOWUPS.md.

## Notes

- Full deploy sequencing and the two bugs found/fixed while implementing this decision are
  recorded in `.omc/plans/2026-08-22-docs-skills-catalog-vercel.md`'s Changelog section.
- Related: `../LESSONS.md` for the Vercel-specific gotchas hit while executing this
  decision (rootDirectory/cwd conflict, framework auto-detection, ambiguous git remote).
