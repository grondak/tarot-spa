---
title: 'tarot-spa Multiuser + LLM Orientation Guide'
status: draft
created: '2026-07-06'
updated: '2026-07-06'
---

# PRD: tarot-spa Multiuser + LLM Orientation Guide
*Working title — confirm.*

## 0. Document Purpose

This PRD defines the next release of tarot-spa: turning it from a solo static single-player app into a small multiuser product for Tony's friend circle, centered on a new LLM-generated Orientation Guide. It's written for Tony as PM/builder and for the downstream architecture and epics/stories work that follows it. Structure: Glossary-anchored vocabulary (§3), features grouped with Functional Requirements nested and globally numbered (§4), assumptions tagged inline with `[ASSUMPTION]` and indexed (§9). Implementation-leaning detail volunteered during discovery (AWS service choices, the literal LLM prompt template) lives in `addendum.md`, not duplicated here.

## 1. Vision

Most bad decisions aren't made because people lack information — they're made because people are oriented incorrectly before they decide.

tarot-spa already has a systems-thinking tarot deck built for exactly this. Today, using it as a decision aid is a manual ritual: Tony draws a few cards, reads what's actually happening in the world, hand-writes a systems-thinking "Lens," and applies it to a real decision by hand-pasting into an LLM. This release turns that ritual into a product. Each user draws their own Cards, Current Events are sourced live, and an LLM generates a personal Lens and applies it — in one shot — to the user's own Context, producing an Orientation Guide: an essay that reframes their situation through systems thinking. It is explicitly not advice, not a summary, and not a conversation — it exists to serve the *Orient* step of the OODA loop, on the theory that a different way of seeing a decision is more valuable than one more opinion.

This release also makes tarot-spa multiuser for the first time — a two-generation invite-key system starting with Tony's direct friends — while keeping real per-request LLM cost bounded by a configurable daily limit per user. The point of the limit isn't to restrict people; it's the specific mechanism that lets this stay free for everyone using it.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** help me actually decide something I've been stuck on, by seeing it from a different angle — not another pro/con list I could've made myself
- **Emotional:** give me an "oh" moment — a reframe, not an opinion or a recommendation
- **Social:** hand me something worth sharing afterward — a phrase, a line, a reframe I want to show someone else
- **Contextual (Tony's own JTBD as builder):** [ASSUMPTION] validate cheaply whether this idea has real legs — friends asking for keys unprompted is the signal — before investing further

### 2.2 Non-Users (v1)

- The general public — v1 is invite-only, two generations deep from Tony (see Glossary: Invite Key)
- Anyone wanting an interactive/conversational advisor — the Orientation Guide is one-shot by design; users who want back-and-forth elaboration are expected to continue the conversation in their own personal LLM, outside tarot-spa

### 2.3 Key User Journeys

- **UJ-1. Erica reorients on a promotion decision and shares the line that lands.**
  - **Persona + context:** Erica, a friend from Capital One, weighing her current role (which she loves) against a VP promotion carrying risk-ownership responsibilities. She's already built a real business case in her head — pros/cons, want-got gaps, management hints, her goals, work/life balance questions.
  - **Entry state:** Authenticated, holding a First-Gen Invite Key Tony sent her directly (with the ability to grant one Invite Key onward). She arrived pre-sold, having already read Tony's LinkedIn article and PR-FAQ.
  - **Path:** She types her full situation as one freeform block into Context. She selects the Decision Spread. She taps **"Help Me Orient."** The system Draws her Cards, sources 3 Current Events, and generates an essay-form Orientation Guide.
  - **Climax:** The guide lands on her Resources card and reframes the people she'd lead as *misplaced resources* — skills sitting on a resume instead of used daily. She pictures specific people (Bob, Jayden), a favorite song puts her in the right headspace, and she decides: take the VP job, because it lets people do what they love.
  - **Resolution:** She highlights the line *"You're making four-star lemonade because you've got the best lemons on the continent"* and shares it with her husband (via native browser copy/paste — no custom share feature).

- **UJ-2. Maya gets an abstract miss and decides on gut instead.**
  - **Persona + context:** Maya, not a systems-thinking person at all — an everyday decision (buy a car vs. keep Ubering). She writes rich, concrete, sensory detail: cost, flexibility, chats with drivers, a saved bumper sticker, missing oil-change and gas-station rituals.
  - **Entry state:** Authenticated, on the orient flow.
  - **Path:** She types her observations in, hits **"Help Me Orient."** The Draw surfaces a Major Arcana Card, The Compression. The Orientation Guide picks up the Card immediately but stays abstract — *"What's the minimum viable complexity?"* — without weaving in her actual bumper sticker, her actual drivers, her actual rituals.
  - **Climax (inverted):** It doesn't land. She makes a face, half-registers the reducibility question underneath it, but it reads as a brush-off. She opens Instagram and wanders off.
  - **Resolution:** She decides on gut alone — buys the more complex, luxury-laden car, arguably the opposite of what the Lens implied. Weeks later the phrase surfaces unbidden: *"What was it that card said... about complexity... is this car too complex?"* No in-app action taken; the guide's only effect was delayed and involuntary.
  - **Edge case:** [ASSUMPTION] A miss gets no special in-app recovery in v1 — a redraw costs another unit of the user's Daily Orientation Limit like any other request.

## 3. Glossary

- **Account** — a registered user, authenticated via Cognito. Holds exactly one Invite Key (the one used to join) and a generation status (First-Gen or Second-Gen).
- **Invite Key** — a credential that grants Account creation. Tony issues Invite Keys directly to his first circle of friends (First-Gen). Each First-Gen Account may grant exactly one Invite Key onward to a friend of their own, creating a Second-Gen Account. Second-Gen Accounts cannot grant further keys (v1).
- **Spread** — a named draw configuration (existing: Single, Three, Decision, System), each defining a fixed number of card positions. Canonical term — do not use "draw style" elsewhere in this document.
- **Card** — one entry from the systems-thinking tarot deck (existing `FULL_DECK`), optionally inverted.
- **Draw** — the act of randomly selecting Cards for a Session according to the chosen Spread.
- **Oblique Strategy** — the function a drawn Card serves: a provocation meant to jolt a new angle of thought, not a fortune or prediction. Governs how a Card's idea must be *used*, not literally referenced, in the Orientation Guide.
- **Context** — the user's freeform account of their situation and observations, typed in ahead of a Draw.
- **Current Events** — real-world items (3, sourced via the LLM's own internet search) woven into the Lens to ground it in the present moment.
- **Lens** — the systems-thinking reframing pattern generated per-Session from the Draw + Current Events, expressed as an idea to view the Context through (not advice).
- **Orientation Guide** — the essay-form output delivered to the user: the Lens applied to their Context. The product's core deliverable.
- **Session** — one complete pass: Context entered, Spread chosen, Draw made, Orientation Guide produced.
- **Daily Orientation Limit** — a configurable per-Account cap on Orientation Guide requests per calendar day; the mechanism keeping the app cheap-as-free.
- **Follow-Up Nudge** — an email sent a randomized delay (up to ~6 days) after a Session, linking to a Survey.
- **Survey** — a short response form reached via a Follow-Up Nudge, capturing what the user actually decided; feeds Success Metrics.
- **OODA Loop** — Observe-Orient-Decide-Act. The Orientation Guide exists to serve the *Orient* step specifically — this is why "advice" and "summary" are explicitly wrong outputs (see Oblique Strategy, Lens).
