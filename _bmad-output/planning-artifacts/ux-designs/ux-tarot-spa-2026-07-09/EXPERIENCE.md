---
name: Systems Thinking Tarot — Multiuser + Orientation Guide
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/review-adversarial-general.md
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/review-rubric.md
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/review-edge-case.md
updated: '2026-07-10'
---

# Systems Thinking Tarot — Experience Spine

## Foundation

Single-surface responsive web — React 19 + Vite + Tailwind CSS v4, no component library (hand-rolled Tailwind utility classes in JSX, same as the existing app). `DESIGN.md` is the visual identity reference; this spine is the behavior. Brownfield: this release extends the existing static single-player app rather than replacing it — the same page resizes for desktop and phone, there is no separate mobile app and no separate mobile IA. Multiuser (Cognito) introduces an authenticated/public surface split for the first time; before this release, everything was public and anonymous.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Public Landing | Root URL, unauthenticated; marketing links (LinkedIn article) | PR-FAQ pitch + public Quick Draw (no login) + Request Access form. Mock: [`mockups/public-landing.html`](mockups/public-landing.html) |
| Sign Up / Redeem Invite Key | "I have an Invite Key" on Public Landing | Redeem an Invite Key and create a Cognito account. Spine-only (no mock) — covered by Component/State Patterns below |
| Context Entry ("Help Me Orient") | Authenticated home | Enter Context, pick a Spread, trigger Orientation Guide generation. Mock: [`mockups/context-entry.html`](mockups/context-entry.html) |
| Orientation Guide Results | After Context Entry submit succeeds | Drawn cards, Current Events, and the Lens applied to the user's Context (FR-8's five-part Guide structure, in essay form); redraw actions. Mock: [`mockups/orientation-guide-results.html`](mockups/orientation-guide-results.html) |
| Quick Draw (authenticated) | Authenticated home, alternate entry to Context Entry | Same as the public Quick Draw: pick a Spread, draw cards, no LLM, no limit. Spine-only (no mock) — pixel-identical to the public Quick Draw section in the Public Landing mock, and already exists in the live app |
| Rate-Limited Intake | Context Entry, when the Daily Orientation Limit is exhausted | Screen degrades to Quick Draw plus an inline note — not a hard block. Mock: second section of [`mockups/context-entry.html`](mockups/context-entry.html) |
| Grant Invite Key | Account/profile area, First-Gen accounts only | Generate the one onward Invite Key, shown as a code to copy and hand to a friend. Spine-only (no mock) — covered by Component/State Patterns below |
| Admin Dashboard | Tony's admin-flagged account only | Usage/spend metrics, mint First-Gen Invite Keys. Spine-only, deliberately no mock — "ugly but functional," no design investment for this release |

Mocks illustrate; the spine (this file + `DESIGN.md`) wins on any conflict.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md.Brand & Style`.

| Do | Don't |
|---|---|
| "Tell me about your upcoming decision, and what you know or think you know about the situation." | "What's on your mind today?" (too generic — invites a mood check-in, not a decision brief) |
| "You're making four-star lemonade because you've got the best lemons on the continent." (UJ-1, in the Guide's actual voice — concrete, tied to the user's own details) | "Trust the process." / "Everything happens for a reason." (generic self-help — exactly what FR-8 says the Guide must not sound like) |
| Rate-limited fallback note: playful, informal, self-aware about being a limit ("hey — chillax with the bidness, relax with the vibe" is Tony's own placeholder register) | "You have reached your daily limit. Please try again tomorrow." (cold, formal, feels like a paywall) |
| Invite Key rejection: specific — "This key's already been used." / "This key was revoked." | "Invalid Invite Key." (doesn't tell the user whether to retry, ask their granter, or give up — flagged directly by the edge-case review) |
| Admin Dashboard: plain and numeric — "3 requests today," "Last refreshed 2 hours ago" | Any dashboard copy dressed up with personality — it's Tony's own utility screen, not user-facing product voice |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Card Display | Quick Draw, Orientation Guide Results | Unchanged from the existing app — image, name, pattern text, questions/examples, plus its existing position-label sub-element (e.g. "Present," "Future"). Inverted state rotates the image and swaps to the amber pattern-text treatment. |
| Orientation Guide Essay | Orientation Guide Results | The Lens applied to the user's Context, rendered as continuous `body-essay` prose — not separate visually-headed sections. Internally moves through FR-8's five parts (pattern-in-situation, what's missing, framing challenge, counterintuitive implication, better questions) as one essay, the way UJ-1's actual guide reads. Sits below the Current Events rundown, above the redraw actions. |
| Ornamental Divider | Context Entry (top+bottom), Orientation Guide Results (bottom only) | Visual-only, no interaction. Marks the boundary of an LLM-touching screen. Never appears on Quick Draw, Sign Up, or Admin Dashboard. |
| Context Textarea | Context Entry | Freeform multi-paragraph plain text. Placeholder text carries the hint copy (not a floating label). Submission is blocked — inline, no request sent — while the field is blank or whitespace-only. |
| Spread Selector | Context Entry, Quick Draw (both authenticated and public) | The existing component, reused verbatim in all three places it appears. |
| "Help Me Orient" CTA | Context Entry | Primary action. Inert while Context is blank. When the Daily Orientation Limit is exhausted, this CTA and the whole screen are replaced by Rate-Limited Intake (see State Patterns) rather than just disabling in place. |
| Redraw Actions | Orientation Guide Results | Two distinct secondary buttons: "Provide another observation" clears Context and returns to a blank Context Entry; "Tweak existing observation" returns to Context Entry with the prior Context text pre-filled for editing. Both start a new FR-8 request and consume a Daily Orientation Limit unit like any other request. |
| Invite Key Field | Sign Up | Validates on submit; renders one of three distinct rejection messages (invalid / already-redeemed / revoked) rather than one generic error — see Voice and Tone. |
| Request Access Form | Public Landing | Name + email, inline-validated (non-empty name, well-formed email) before submit. Success state is a simple on-page acknowledgment — no waitlist position, no confirmation email. |
| Grant Key Action | Grant Invite Key (account/profile area) | Single action, First-Gen accounts only; produces one onward Invite Key rendered as a copyable code (`key-code-display`, matching the existing draw-code chip treatment). No send-by-email step — the user copies it themselves. Already-used state: see State Patterns. |
| Admin Metrics + Mint Key | Admin Dashboard | Plain metrics list/table (per FR-11: users by generation, Session count, Daily Orientation Limit hit-rate, spend-to-date vs. the FR-10 budget ceiling) + one "Mint Key" button. No charts, no visual polish beyond reusing existing components — explicitly low investment for this release. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Generation in flight | Context Entry (transitioning to Results) | Target ~20s (FR-8). Loading treatment stays on the Context Entry screen itself (not a blank interstitial) with expectation-setting copy (e.g. "Reading the cards and the world..."). |
| Generation failed outright | Context Entry | Clear inline error; does not consume a Daily Orientation Limit unit (FR-8 NFR); user can retry immediately without re-entering Context. |
| Daily Orientation Limit exhausted | Context Entry → Rate-Limited Intake | Whole screen degrades to the Quick Draw experience plus a short, playful inline note — not a hard rejection message. (Supersedes prd.md FR-9's current wording — flagged as a PRD follow-up.) |
| Invalid / already-redeemed / revoked Invite Key | Sign Up | Distinct copy per reason; redeemed/revoked messaging points the user to their granter or Tony directly, since there's no in-app recovery path. |
| Sign Up succeeds | Sign Up → Context Entry | Redirects straight to the authenticated home (Context Entry); no separate "welcome" interstitial. |
| Empty Context submitted | Context Entry | Submission blocked inline; no request sent; no Daily Orientation Limit unit consumed. |
| Request Access form invalid | Public Landing | Inline error for empty name / malformed email; submission blocked until resolved. |
| Request Access success | Public Landing | Simple on-page acknowledgment only — no waitlist position, no confirmation email (FR-5 explicit Out of Scope). |
| Admin data possibly stale | Admin Dashboard | Visible "last refreshed" timestamp text — no alert styling, just always-visible plain text (addresses the edge-case review's silent-stale-refresh finding without adding dashboard polish). |
| Draw-code load fails | Quick Draw (any surface with the loader) | Existing behavior carried forward unchanged: inline "Unrecognized draw code." error text. |
| Onward key already generated | Grant Invite Key | Action is disabled/hidden once used (one onward key per First-Gen account, FR-2) — replaced by a plain confirmation that the key was already granted, not an error. |
| Key minting fails | Grant Invite Key, Admin Dashboard (Mint Key) | Clear inline error, action stays available to retry; no partial/ambiguous state (an Invite Key either exists, unredeemed, or it doesn't). |
| Non-First-Gen reaches Grant Invite Key | Account/profile area | Surface hidden entirely from a Second-Gen account's nav — no blocked/permission-denied screen, since FR-2 gives Second-Gen accounts no path to this capability at all. |
| Non-admin reaches Admin Dashboard | Anywhere | Surface hidden entirely from nav for any non-admin-flagged account — same "hidden, not blocked" pattern as Grant Invite Key above. |
| Orientation Guide Results reloaded/revisited directly | Orientation Guide Results | The screen is a transient view-state, not a persisted route — a direct reload or revisit bounces to Context Entry rather than attempting to re-render a stale Guide. |

## Interaction Primitives

Mouse/touch-first, no keyboard-shortcut layer (unlike a power-user tool — this is a casual, low-frequency-use app for friends). Standard tab order through forms.

- **Highlight-and-share** is the entire sharing mechanism for the Orientation Guide: native browser text selection + OS copy/paste. No custom share button, no share sheet integration. This is deliberate, not a v1 gap (per prd.md).
- **Draw-code copy** — the existing "copy draw code" icon-button behavior (Quick Draw) carries forward unchanged.
- **Redraw** — "Draw Again" (Quick Draw) and the two redraw actions (Orientation Guide Results) are all single-click/tap, no confirmation dialog.

**Banned:** confirmation dialogs on redraw/retry actions (the existing app trusts the user; this release doesn't introduce friction it didn't already have).

## Accessibility Floor

Behavioral; visual contrast lives in `DESIGN.md`. Hobby-tier stakes — no formal WCAG audit — but a floor is still maintained:

- Every form input (Invite Key, Context textarea, Request Access name/email) has an associated label, even where visually minimal.
- Existing focus-visible treatment (`focus:border-{colors.primary}`) carries forward on every new input and button.
- `body-essay` text respects a constrained reading measure (`DESIGN.md.Layout & Spacing`) — a basic legibility floor for everyone, not just an accessibility nicety.
- Tab order follows visual/reading order on every new screen, matching the existing app's simple DOM-order forms.

## Responsive & Platform

Single Tailwind breakpoint set (`sm`/`md`/`lg`/`xl`), the same one already used in the existing `SpreadView` card-grid logic. No separate mobile app, no separate mobile IA — every surface in the table above resizes rather than branching. The hardcoded `/tarot-spa/` base path (`vite.config.js`) applies to any new routing this release introduces (Sign Up, Admin Dashboard, etc.) — carried forward as a hard constraint, not a UX decision.

## Inspiration & Anti-patterns

- **Carried forward from the existing app:** the dark utilitarian tarot-card aesthetic, the draw-code sharing pattern, minimal chrome, no confirmation dialogs.
- **New for this release:** the Edwardian-wingding ornamental divider as a ritual-framing device — used only around the two LLM-touching moments (Context Entry, Orientation Guide reveal), deliberately absent everywhere else.
- **Rejected — New Age mystical iconography:** crystals, swirling stars, glow/gradient effects. The product's pattern-language is systems-thinking, not fortune-telling; the Edwardian reference is formal/ritual, not mystical.
- **Rejected — Survey/email-nudge UI:** cut from v1 scope entirely (prd.md update); no corresponding screens exist in this IA.
- **Rejected — Admin dashboard charts/graphs:** explicitly "ugly but functional" — plain numbers and a table, no visualization investment.
- **Rejected — hard rejection-only messaging on rate-limit:** superseded by the graceful degrade-to-Quick-Draw pattern (see State Patterns).

## Key Flows

### UJ-1 — Erica reorients on a promotion decision and shares the line that lands

1. Erica already redeemed her First-Gen Invite Key and is authenticated — she arrives at **Context Entry** having already read Tony's LinkedIn article and PR-FAQ on **Public Landing**.
2. She types her full situation — pros/cons, want-got gaps, management hints, goals, work/life balance — into the Context Textarea as one freeform block.
3. She picks the **Decision** Spread from the Spread Selector.
4. She taps **"Help Me Orient."** The screen shows the ~20s loading treatment ("Reading the cards and the world...").
5. **Climax:** **Orientation Guide Results** loads. Her drawn cards appear at top; below, the Current Events rundown; below that, the Orientation Guide Essay — the Lens applied to her Context — lands on her Resources card, reframing the people she'd lead as *misplaced resources*, rendered in `body-essay` typography wide enough to read comfortably. She decides: take the VP job.
6. **Resolution:** She highlights *"You're making four-star lemonade because you've got the best lemons on the continent"* using native text selection, copies it, and pastes it to her husband outside the app. Later, from her account area, she uses **Grant Invite Key** to generate her one onward key and sends it to a friend herself.

### UJ-2 — Maya gets an abstract miss and decides on gut instead

1. Maya arrives at **Context Entry** authenticated, on a much more everyday call — car vs. Ubering.
2. She types rich, concrete, sensory detail into the Context Textarea: cost, flexibility, a saved bumper sticker, missing oil-change rituals.
3. She hits **"Help Me Orient."** After the loading treatment, **Orientation Guide Results** loads: her card is Major Arcana *The Compression*.
4. **Climax (inverted):** The Orientation Guide Essay picks up the Card idea immediately but stays abstract — *"What's the minimum viable complexity?"* — without weaving in her bumper sticker, her rituals, her specifics. She half-registers it, opens Instagram, wanders off.
5. **Resolution:** She never uses the redraw actions — she just leaves and decides on gut alone, picking the more complex option. No in-app action taken; the Guide's only effect is delayed and involuntary (a phrase resurfaces weeks later, outside the app entirely).

### New Flow (UX-added, not in prd.md) — Priya, a LinkedIn contact, becomes a requester

> Not a PRD-sourced UJ — prd.md §2.3 defines only UJ-1 and UJ-2. This flow was drafted during UX discovery to close IA coverage for the Public Landing / public Quick Draw / Request Access surfaces, which neither PRD journey touches (both start already-authenticated). Named here without a "UJ-" prefix so it isn't mistaken for a third PRD journey.

1. Priya clicks through from Tony's LinkedIn article, landing unauthenticated on **Public Landing**.
2. She reads the PR-FAQ pitch, then — no login required — tries the **public Quick Draw**: picks the Single Spread, draws one card, reads its pattern and questions.
3. **Climax:** The card is sharper than she expected. She wants the deeper "Help Me Orient" experience the PR-FAQ describes, but that's Invite-Key-gated.
4. She fills out the **Request Access Form** (name + email); inline validation catches nothing wrong, and she submits.
5. **Resolution:** She sees a simple on-page acknowledgment — no waitlist position, no confirmation email — and waits for Tony to follow up with her personally.
