# Addendum — tarot-spa Multiuser + LLM Orientation Guide

Implementation-leaning detail volunteered during PRD discovery. Belongs in architecture, not the PRD narrative.

## Technology direction (AWS-native, per Tony)

- **Auth/multiuser:** AWS Cognito
- **LLM:** AWS Bedrock — specific model left open ("LLM is whatever, we'll get it from Bedrock")
- **API:** AWS API Gateway + Lambda, fronting the orientation-guide request
- **Hosting/CDN:** Heavy use of AWS Amplify — Tony's framing: "it's meant to be used" (i.e. lean into Amplify's opinionated hosting/CDN/auth-glue rather than hand-rolling equivalents)
- Current static frontend (GH Pages) migrates to this AWS stack — replaces, not supplements, GH Pages

## Interaction model

- The LLM call is explicitly **one-shot**, not a conversational/interactive problem-solving session — matches the OODA-loop "orientation guide" framing, not a chatbot
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
