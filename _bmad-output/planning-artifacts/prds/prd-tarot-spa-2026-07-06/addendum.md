# Addendum — tarot-spa Multiuser + LLM Orientation Guide

Implementation-leaning detail volunteered during PRD discovery. Belongs in architecture, not the PRD narrative.

## Technology direction (AWS-native, per Tony)

- **Auth/multiuser:** AWS Cognito
- **LLM:** AWS Bedrock — Claude Opus is the implemented generation model
- **API:** Amplify Gen 2 AppSync exposes a short-lived `startOrientationGuide` mutation backed by a starter Lambda. The starter validates the authenticated request, conditionally creates the caller-owned `PENDING` Session, invokes a version-pinned durable worker, and returns the Session ID without waiting for generation.
- **Execution:** AWS Lambda Durable Functions provide code-first checkpointing, replay, retries, and execution tracking for the tightly coupled reservation → Draw → Tavily → Bedrock → persistence workflow.
- **Completion:** The browser follows the exact owner-authorized Session ID through AppSync model reads. It does not wait synchronously for generation and does not infer completion from the newest Session.
- **Hosting/CDN:** AWS Amplify Hosting, replacing the former GitHub Pages deployment.
- **Orchestration boundary:** Step Functions remains a valid future option if this capability grows into broader multi-service orchestration. It is not selected for this increment because the workflow remains tightly coupled application logic and the installed Amplify backend supports durable Lambda configuration directly.

## Interaction model

- The Orientation Guide remains explicitly **one-shot**: one deliberate user submission produces at most one Draw and one LLM-generated Guide, with no conversational follow-up turns. "One-shot" describes the product interaction and model call, not a requirement that the browser, AppSync, and generation worker remain inside one synchronous request.
- A user can copy their session's output/inputs out to their own personal LLM if they want further back-and-forth elaboration — that elaboration is explicitly out of scope for tarot-spa itself

## Core mechanism — the "lens" (Tony's essay, verbatim reference)

Tony's framing, in his own words: *"Most bad decisions aren't made because people lack information. They're made because people are oriented incorrectly before they decide."*

**The manual process today (what the app automates):**
1. Tony draws a few system-pattern cards from his own systems-thinking tarot deck
2. He looks at what's actually happening in current events/the world right now
3. He generates a **"lens"** — a reframing of a systemic pattern (e.g. *"When shared systems cross into new domains, small disruptions stop being local problems and start becoming systemic risks"*), grounded with 2-4 concrete current-events examples, closing with a handful of orienting questions
4. He pastes that lens plus his own situational context into ChatGPT with a structured prompt (below) to get help orienting on an actual decision

**The prompt template driving the LLM call:**
- **Lens:** the generated reframing pattern + why it's showing up now (current events)
- **Context:** the user's own situation/decision + their own observations
- **Instructions to the LLM:**
  - Identify where this pattern actually shows up in their situation
  - Point out what they're likely missing
  - Challenge their framing if they're asking the wrong question
  - Give one non-obvious/counterintuitive implication
  - Suggest better next questions they should be asking
- **Constraints on the LLM:** be concrete and specific; avoid generic or widely-known advice; prefer reframing over summarizing

**Critical distinction:** the output is an orientation shift (a new way of seeing the problem), not advice, a recommendation, or a summary. This shapes both the prompt design and how success should be measured — "did this change how they saw it" not "did this tell them what to do."

## Deferred

- Exact user-facing prompt copy for capturing the user's "observations about their problem" — Tony has ideas, held back for now. Marked `[TO BE PROVIDED]` wherever it would otherwise appear.
