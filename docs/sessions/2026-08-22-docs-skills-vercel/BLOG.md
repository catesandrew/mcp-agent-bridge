<!--
PUBLIC blog post draft. ⚠ Reviewed for sanitization: no client names, internal repo
paths, or secrets appear below — this describes a public open-source project
(mcp-agent-bridge) and public infrastructure (Vercel, Cloudflare, GitHub Pages), so the
usual redaction pass mostly doesn't apply. Still: review before publishing, since it names
real domains, project IDs, and a specific sibling project by name.
-->

# What a plan review loop actually catches, in practice

*Three review rounds found three completely different bug classes on the same small
change — and a fourth bug only showed up after the code actually ran.*

## The problem

I wanted to move a small open-source project's documentation site off GitHub Pages and
onto Vercel, on a custom subdomain, matching the shape of a sibling project already
running the same way. On paper this is a config edit: change two fields in a Docusaurus
config, point a Vercel project at the right folder, add a DNS record. I wrote a plan for
it, ran it through a review loop before touching any code, and expected the review to
rubber-stamp something this small.

It didn't. Three rounds of independent review found three genuinely different problems,
and a fourth only surfaced after the infrastructure was actually stood up. None of the
four were things I'd have caught by re-reading my own plan a fourth time.

## What I tried

The review loop was simple: a "planner" draft, then an "architect" pass focused on
soundness and steelmanning the alternative, then a "critic" pass focused on whether the
acceptance criteria actually held up — looped until both approved.

Round 1 caught the most obvious miss: the existing auto-deploy workflow for the old
hosting target was still active, and would fire on the very next code push — publishing a
broken build to the *old* URL, because the config change I was making would leave it with
the wrong asset paths for that host. Easy to miss when you're focused on the *new* host and
forget the old one is still watching for the same file changes.

Fixing that introduced a new bug: my fix reordered things so the old deploy target's
retirement happened *after* verifying the new host was live — which sounds safer, but
meant the new host's very first build would run against the *old*, unfixed config. Round 2
caught that.

Round 2's own fix — pinning an explicit build-root setting to match the sibling project —
was itself inconsistent with a command I'd left unchanged elsewhere in the same plan: I was
still running the deploy tool from *inside* the subfolder that setting pointed at, which
would make the tool look for a folder-inside-itself that didn't exist. Round 2's critic
caught that one.

```
# The shape of the fix, once all three rounds landed:
# 1. Edit config + delete old workflow together (not sequentially)
# 2. Run the deploy tool from the repo root, not the subfolder
# 3. Set BOTH the build-root AND the framework explicitly — don't assume auto-detection
# 4. Only push once the new host is independently verified live
```

Then, after all three rounds approved and the infrastructure actually went up: an
independent post-implementation check (not the same pass that built it) found that the
"deploy to a staging environment first, verify, then promote" step I'd planned for never
actually happened — because it was a brand-new hosting project with no existing
production deployment, the very first deploy went straight to production instead of a
separate preview. The deploy worked fine. But "worked fine" and "happened the way the plan
said it would" are different claims, and only a fresh look at what actually ran caught the
gap between them.

## What I learned

- **Each review round targets a different bug class, not the same bug harder.** The
  sequencing bug, the config-consistency bug, and the cwd-vs-setting bug were three
  unrelated failure modes. A single very-thorough review pass is not the same as three
  independent passes — the second and third rounds existed specifically because the first
  round's *fix* created new surface area to check.
- **A plan review can't catch what only exists once the plan runs.** The "first deploy
  becomes production instead of a preview" behavior isn't something you'd find by reading
  a deploy plan closely — it's a property of the specific tool and the specific
  fresh-project state, and it only shows up once you actually execute against it.
- **"It worked" and "it worked the way I said it would" are worth checking separately.**
  The end state was fine — the site deployed correctly either way. But silently upgrading
  "it happened to work" into "the plan's safety check passed" would have hidden a real gap
  for the next time the same risk (an unproven build environment) actually mattered.

## Takeaways

- If a review loop keeps finding things, that's not the loop being overly picky — each
  fresh finding is a different bug class the previous rounds' fixes newly exposed.
- Config changes with irreversible-ish side effects (DNS, hosting cutovers) benefit from
  the same "verify before promoting" discipline as code deploys, even when the change
  itself looks trivial.
- After execution, re-verify against the *plan's own acceptance criteria* with fresh eyes
  — not just "does the end result look right," but "did it happen the way I said it would,
  and if not, is that difference actually safe."

---

<!-- Suggested tags: engineering-process, code-review, infrastructure, ai-assisted-development · Est. reading time: 4 min -->
