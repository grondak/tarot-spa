---
title: 'Show the intake question on the results screen'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'one-shot'
---

# Show the intake question on the results screen

## Intent

**Problem:** The Orientation Guide results screen doesn't echo what the user asked, so a reading read later (or shared) has no visible question.

**Approach:** Render the intake Context, already carried on `result.context`, as a "Your Question" section above "Your Draw". Hide it when empty or whitespace.

## Suggested Review Order

**Question section**

- Reads `result.context` with the existing string guard; blank means no section.
  [`OrientationGuideResults.jsx:25`](../../src/components/OrientationGuideResults.jsx#L25)

- New "Your Question" section, newlines kept, long words wrapped.
  [`OrientationGuideResults.jsx:39`](../../src/components/OrientationGuideResults.jsx#L39)

**Tests**

- Asserts the section shows, and sits above the draw in DOM order.
  [`OrientationGuideResults.test.jsx:72`](../../src/components/OrientationGuideResults.test.jsx#L72)
