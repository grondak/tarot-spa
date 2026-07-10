# PRD Quality Review — tarot-spa Multiuser + LLM Orientation Guide

## Overall verdict

This PRD is unusually disciplined for a hobby-tier document: it has a real thesis (the OODA "Orient" step), features that visibly serve that thesis rather than a backlog, honest trade-offs (disposable cutout-email intake, one-shot-only LLM interaction, deferred paid tier openly named as "the whole point of the exercise"), and clean Glossary/ID hygiene. The one substantive risk is Done-ness clarity on the flagship FR (FR-8): the quality bar that actually defines product success — "grounded, not abstract" — is prose judgment, not a testable condition, and the PRD acknowledges this without resolving it. A handful of small mechanical slips (an Open Question numbering gap, partial Assumptions Index roundtrip) don't threaten the verdict but are worth a cleanup pass before this feeds architecture.

## Decision-readiness — strong

Trade-offs are named with what's given up, not just what's chosen. §4.2's `[NOTE FOR PM]` on the request-access cutout email is a genuine accepted risk ("if the form is abused, the mitigation is to retire that address... deliberately disposable infrastructure, not a system to harden") rather than a hedge. §8.2's note on the paid tier — "This is the whole point of the exercise for Tony personally — worth a real revisit the moment invite requests start outpacing supply, not just a someday-maybe" — surfaces a real tension between the stated MVP JTBD (validate cheaply) and Tony's actual ambition, exactly where a PM might otherwise paper over it. §6 Privacy's open question (raw-content access for prompt debugging vs. strict aggregation) is a live, unresolved tension, not a rhetorical question answered in the next sentence. UJ-2 (Maya) is a deliberately-included *miss* — the PRD doesn't launder the product's failure mode into a win.

No findings — this dimension holds up without qualification.

## Substance over theater — strong

Two UJs, both load-bearing (Erica's win drives FR-2's onward-key realization and the UJ-2 "grounded vs. abstract" quality bar that FR-8 is built around; Maya's miss drives the `[ASSUMPTION]` on no special miss-recovery in §2.3 and the counter-metric SM-C1). Neither reads as filler. The Vision statement ("Most bad decisions aren't made because people lack information — they're made because people are oriented incorrectly before they decide") is Tony's own verbatim framing (confirmed in addendum.md) describing a specific existing manual ritual being productized — it could not swap into another PRD unchanged. Cross-Cutting NFRs (§5) are specific and falsifiable ("No Account can access another Account's Context, Draw, or Orientation Guide"; "must not consume a Daily Orientation Limit unit") rather than the generic "system must be scalable/secure/reliable" boilerplate the rubric warns about.

No findings — nothing here reads as furniture.

## Strategic coherence — strong

The thesis (OODA "Orient" step; reframe over advice) is stated once in §1 and then actually drives feature inclusion: the Daily Orientation Limit (§4.4) exists because the thesis requires a real LLM call per session, not a cached response; the invite-key growth model (§4.1) exists to keep the validation signal (§2.1 JTBD, SM-1) honest by capping exposure; Follow-Up Nudge/Survey (§4.5) exists to measure orientation *shift*, not compliance. Success Metrics validate the thesis directly — SM-3 ("% of Survey responses indicating the Orientation Guide meaningfully influenced how the user saw their decision") is a quality-of-reframe metric, not an activity metric like DAU/MAU. The counter-metrics (§9 SM-C1, SM-C2) are a strong tell of real strategic thinking: SM-C1 explicitly guards against optimizing for compliance ("the product is explicitly meant to reorient, not to be complied with"), which is the exact failure mode a less-considered PRD would have missed.

No findings.

## Done-ness clarity — adequate

Most FRs carry testable Consequences and read cleanly (FR-1, FR-2, FR-4, FR-9, FR-10, FR-11, FR-12, FR-13 all have bound, checkable conditions). But the FR that matters most — FR-8, Orientation Guide generation — has a central acceptance condition that is not operationalizable as an engineering test.

### Findings
- **high** FR-8's quality bar is unfalsifiable prose (§4.3) — "demonstrably incorporates specific details from the user's own Context rather than restating the Card's idea abstractly," "Output is concrete and specific, avoids generic/widely-known advice, and prefers reframing over summarizing." This is the single acceptance criterion that determines whether the product's core deliverable works, and it has no operational test — no rubric, no example set, no pass/fail method. The PRD is self-aware about this (§4.3 Notes: "a prompt-design problem more than a spec-able requirement — expect iteration post-launch rather than a one-time fix"), which is honest scope framing, but honesty about the gap doesn't close it: whoever implements FR-8 still has no way to know when it's "done." *Fix:* add a lightweight eval hook — even a small held-out set of Context examples (Erica-style and Maya-style) with an explicit human pass/fail rubric — so downstream stories have something to test against, even if the bar stays qualitative.
- **medium** FR-6's hint-copy scoping is ambiguous (§4.3) — "may vary depending on the type of orientation problem (e.g. differs by Spread)" leaves open whether per-Spread hint variation is itself a v1 requirement or bundled into the already-deferred `[TO BE PROVIDED]` copy. *Fix:* state explicitly whether "varies by Spread" is in scope for v1 or deferred alongside the copy itself.

## Scope honesty — strong

Non-Goals (§7) does real work and matches §8.2's Out-of-Scope-for-MVP list one-for-one, each with a stated reason rather than a bare bullet (e.g., "deferred until the demand signal in §2.1 JTBD actually shows up"). `[ASSUMPTION]`, `[OPEN QUESTION]`, and `[NOTE FOR PM]` tags land at genuine tensions (privacy/aggregation, survey question design, second-gen grant capability) rather than safe checkpoints. Given the explicit hobby/low-stakes framing, the open-items density (5 Open Questions, 7 indexed Assumptions, 3 NOTE FOR PM callouts) is appropriate, not alarming — per the rubric's own calibration, a high count is fine at this stakes level.

### Findings
- **low** Assumptions Index roundtrip is incomplete — 4 of 7 indexed assumptions (FR-1, FR-5, FR-6, FR-9) have no matching inline `[ASSUMPTION]` tag in the body; they appear as plain Notes/Consequences text, so a reader hitting them in §4 has no signal they're inferences rather than confirmed decisions. See Mechanical notes for the full list. *Fix:* add inline `[ASSUMPTION]` tags at the four untagged spots, or fold them into Notes consistently with a lighter marker if full tagging is overkill for this stakes level.

## Downstream usability — strong

Glossary (§3) is rich (15 terms) and used consistently in case and form throughout — "Spread," "Draw," "Context," "Current Events," "Lens," "Orientation Guide," "Session" all read identically across Vision, UJs, FRs, and Success Metrics. The Glossary's own discipline note ("Canonical term — do not use 'draw style' elsewhere in this document") is honored; no drift found. FR/UJ/SM IDs are contiguous and cross-references resolve (FR-13 correctly cross-refers to FR-3 and FR-5; FR-2 correctly cited from UJ-1). Both UJs have named, contextualized protagonists (Erica, Maya) — no floating UJs.

### Findings
- **low** Open Questions numbering has a gap — §10 lists items 1, 3, 4, 5, 6 with no item 2. Cross-references into this list still resolve correctly by luck (item 5 correctly maps to the Daily Orientation Limit question), but the gap will confuse anyone citing "Open Question 2" downstream. See Mechanical notes.

## Shape fit — strong

Correctly calibrated for a hobby/solo, chain-top PRD (feeds architecture and epics/stories, per §0 Document Purpose). Two UJs with named protagonists is proportionate for a consumer-facing product where the essay's quality *is* the product — not UJ theater, not under-formalized. The FR/Consequences/Assumptions-Index apparatus is heavier than "rigor light" alone would suggest, but the PRD explicitly exists to hand off downstream (§0), which is exactly the condition under which the rubric says heavier traceability is warranted. Brownfield references are accurate and clearly marked as carried-forward-unchanged (existing `FULL_DECK`, existing four Spreads, existing Tailwind responsive layout, existing PR-FAQ becoming the landing page) — nothing reads as inventing history the codebase doesn't have.

No findings.

## Mechanical notes

- **Open Questions numbering gap:** §10 skips from item 1 to item 3 — there is no item 2. Likely a question was removed or renumbered without updating the list. Low-to-medium risk since remaining cross-references (item 5 cited from FR-9's assumption entry) still resolve correctly, but worth a renumber pass before downstream work cites these by number.
- **Assumptions Index roundtrip gap:** Of the 7 entries in §11, only 3 have a matching inline `[ASSUMPTION]` tag in the body text (§2.1 JTBD, §2.3 UJ-2 miss-recovery, §6 Monetization paid tier). The other 4 (FR-1 single-use/non-expiring keys, FR-5 transactional-only request form, FR-6 contextual hint shown, FR-9 configurable-without-deployment cap) are indexed as assumptions but appear as plain prose in their FR's Notes/Consequences, with no inline bracket tag.
- **Minor cross-reference drift:** The `[OPEN QUESTION]` inline tag about Second-Gen onward-grant capability sits under §4.1 FR-3 ("Tony-issued First-Gen keys"), but §10's Open Question 6 cites it as "(FR-2)" — FR-2 is the closer semantic match (First-Gen grant capability) but not where the inline tag physically lives. Cosmetic, doesn't block downstream reading.
- **Glossary discipline:** No drift found — capitalization and terminology (Spread, Draw, Card, Context, Current Events, Lens, Orientation Guide, Session, Invite Key, First-Gen/Second-Gen) are used identically everywhere checked, including the Glossary's own instruction to avoid "draw style" as a synonym.
- **ID continuity:** FR-1 through FR-13 contiguous with no gaps or duplicates; UJ-1/UJ-2 and SM-1–5 plus SM-C1/C2 contiguous; all cross-references between FRs (e.g., FR-13 → FR-3, FR-5) resolve correctly.
- **Housekeeping:** The subtitle "*Working title — confirm.*" under the document title is still open — trivial, but flag before this ships downstream so the working title doesn't silently ossify into the real one.
