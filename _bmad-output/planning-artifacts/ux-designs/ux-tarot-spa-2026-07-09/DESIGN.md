---
name: Systems Thinking Tarot
description: Dark, modern, indigo-accented utility aesthetic for a systems-thinking tarot tool; this file names the visual deltas for the multiuser + Orientation Guide release.
status: final
updated: '2026-07-10'
colors:
  surface: '#030712'
  surface-container: '#111827'
  surface-container-high: '#1f2937'
  outline: '#374151'
  outline-variant: '#1f2937'
  on-surface: '#ffffff'
  on-surface-variant: '#d1d5db'
  on-surface-muted: '#9ca3af'
  on-surface-faint: '#4b5563'
  primary: '#6366f1'
  primary-strong: '#4f46e5'
  on-primary: '#ffffff'
  primary-container: 'rgba(49, 46, 129, 0.6)'
  on-primary-container: '#a5b4fc'
  inverted-accent: '#f59e0b'
  inverted-accent-soft: '#fcd34d'
  error: '#f87171'
typography:
  display:
    fontFamily: system-ui
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline:
    fontFamily: system-ui
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  title:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: '700'
    lineHeight: '1.3'
  body:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-essay:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.75'
  label-caps:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  lg: 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  section-gap: 48px
components:
  button-primary:
    background: '{colors.primary-strong}'
    backgroundHover: '{colors.primary}'
    text: '{colors.on-primary}'
    radius: '{rounded.DEFAULT}'
  button-secondary:
    background: '{colors.surface-container-high}'
    backgroundHover: '#4b5563'
    text: '{colors.on-surface-variant}'
    radius: '{rounded.DEFAULT}'
  card-container:
    background: '{colors.surface-container}'
    border: '{colors.outline}'
    radius: '{rounded.xl}'
    shadow: 'xl'
  input:
    background: '{colors.surface-container}'
    border: '{colors.outline}'
    borderFocus: '{colors.primary}'
    text: '{colors.on-surface}'
    radius: '{rounded.DEFAULT}'
  position-label:
    background: '{colors.primary-container}'
    text: '{colors.on-primary-container}'
    typography: '{typography.label-caps}'
  ornamental-divider:
    glyph: '❦'
    glyphUnicode: 'U+2766 FLORAL HEART'
    rule: '{colors.outline}'
    glyphColor: '{colors.on-surface-muted}'
    glyphSize: '18px'
  spread-selector:
    background: '{colors.surface-container}'
    backgroundHover: '{colors.surface-container-high}'
    border: '{colors.outline}'
    borderHover: '{colors.primary}'
    radius: '{rounded.xl}'
  key-code-display:
    background: '{colors.surface-container-high}'
    border: '{colors.outline}'
    text: '{colors.on-surface-variant}'
    fontFamily: monospace
    radius: '{rounded.DEFAULT}'
---

## Brand & Style

Systems Thinking Tarot reads as a serious diagnostic tool wearing tarot's clothes, not a mystical or New Age product. The existing app already committed to this: dark canvas, indigo accent, uppercase-tracked micro-labels, card-as-artifact framing — closer to a well-made developer tool than a fortune-telling app. This release keeps that identity completely intact and layers one new motif on top: an "Edwardian wingding" ornamental flourish that frames the two moments the LLM actually speaks (Context Entry, Orientation Guide reveal) with a wink of old-world ritual formality — not mysticism, not whimsy, a nod to the fact that something considered is about to happen. Everywhere else (Quick Draw, sign-up, Admin Dashboard) stays exactly as utilitarian as it is today.

## Colors

The palette is inherited directly from Tailwind's default scale — the app has no custom CSS variable layer, components are styled with Tailwind utility classes in JSX, and that continues.

- **`surface` (gray-950) / `surface-container` (gray-900) / `surface-container-high` (gray-800)** — the existing three-step dark tonal stack: page canvas, card/panel background, hover/active background.
- **`outline` (gray-700) / `outline-variant` (gray-800)** — borders and dividers; `outline` for visible card/input borders, `outline-variant` for quiet section rules.
- **`on-surface` (white) / `on-surface-variant` (gray-300) / `on-surface-muted` (gray-400) / `on-surface-faint` (gray-600)** — the existing text hierarchy, faintest step reserved for meta/timestamp-style text (e.g. draw codes, "last refreshed").
- **`primary` (indigo-500) / `primary-strong` (indigo-600)** — the app's one accent color: primary buttons, focus rings, links, hover states. Used sparingly and consistently, never for two different meanings on the same screen. **`on-primary`** (white) is the fixed text/icon color on any primary-fill surface (e.g. the "Help Me Orient" button label) — always paired with `primary`/`primary-strong`, never used standalone.
- **`primary-container` / `on-primary-container`** (indigo-900 at 60% opacity / indigo-300) — the existing card position-label treatment (e.g. "Present," "Future" tags on drawn cards). `primary-container` is deliberately an alpha-blended value (not a flat hex) because the real Tailwind class it mirrors is `bg-indigo-900/60` — the transparency is the point, letting the card's own background show through slightly.
- **`inverted-accent` (amber-500) / `inverted-accent-soft` (amber-300)** — reserved exclusively for inverted-card state; never used decoratively or for anything else, so its appearance always means "this card is inverted."
- **`error` (red-400)** — form/validation errors only (bad draw code, invalid Invite Key, malformed Request Access submission).

## Typography

`system-ui` stack throughout — no webfont load, matching the existing app exactly. `display` (36px, bold) is the one-per-screen hero title (e.g. "Systems Thinking Tarot" on Public Landing); `headline` (24px, bold) titles a screen's main content block (e.g. a Spread's name on Quick Draw); `title` (18px, bold) names an individual item within a screen (e.g. a drawn Card's name); `body` (14px) is the existing default copy size everywhere else (descriptions, questions, examples). All four are pre-existing, unchanged treatments — carried forward, not redesigned.

One addition for this release: **`body-essay`**, a larger, more generously-leaded role (18px/1.75 vs. the standard 14px/1.5 `body`) reserved for the Orientation Guide's essay text. Every other surface in the app is short-label/card-copy dense; the Guide is the one place a user reads several paragraphs of prose, and it needs room to breathe that the rest of the interface deliberately doesn't have.

`label-caps` (12px, uppercase, tracked 0.1em) is the existing micro-label treatment — position tags, "Questions to ask," "Examples across domains" — carried forward unchanged and reused for any new micro-labels this release introduces (e.g. "Current Events").

## Layout & Spacing

Existing Tailwind spacing scale, no new scale introduced. `gutter` (16px) is the standard inter-element gap already used throughout (`gap-4`, `p-4`); `section-gap` (48px, roughly the existing `py-12`/`mb-12` usage) marks a full section break — used between the ornamental divider and the content it brackets, and between major blocks on the Orientation Guide Results screen (drawn cards → Current Events rundown → Orientation Guide Essay).

`body-essay` content additionally constrains to a readable measure (approx. `max-w-2xl`, ~65ch) rather than stretching to the page's full `max-w-6xl` — the one place in the app where line length is tuned for reading, not scanning.

## Elevation & Depth

Unchanged from the existing app: `shadow-xl` on card containers and drawn-card images, no elevation on flat surfaces (buttons, inputs, section backgrounds). No new depth language introduced for this release.

## Shapes

Unchanged: `rounded.xl` (existing `rounded-2xl`) for card/panel containers, `rounded.lg` (existing `rounded-xl`) for card artwork, `rounded.DEFAULT` (existing `rounded-lg`) for buttons and inputs. `rounded.full` reserved but not currently used anywhere.

## Components

- **Button (primary/secondary)** — unchanged from the existing `SpreadView`/`SpreadSelector` button treatment. "Help Me Orient" and "Draw Again" are both `button-primary`; "Back," "Load," and the two redraw actions on the Orientation Guide Results screen are `button-secondary`.
- **Card Display** — unchanged `CardDisplay` component and card art. Reused as-is in Quick Draw and inside the Orientation Guide Results screen's card rundown. Its position-label sub-element (see `position-label` token) is unchanged too — carried forward as part of this same component, not a separate visual treatment.
- **Spread Selector** — unchanged existing component (`SpreadSelector.jsx`): a grid of Spread option cards (`surface-container` background, `outline` border, `primary` border on hover) plus the "load a draw" code field. Reused verbatim across all three surfaces that offer Spread selection (Context Entry, authenticated Quick Draw, public Quick Draw) — no visual delta for this release.
- **Input** — unchanged text-input treatment (draw-code loader, Invite Key field, Request Access name/email) — `surface-container` background, `outline` border, `primary` border on focus.
- **Key/Code Display (new)** — for the Grant Invite Key action's generated code and the existing draw-code display: monospace text on a `surface-container-high` chip with an `outline` border, matching the existing draw-code treatment (`SpreadView.jsx`'s `<code>` chip) exactly rather than inventing a new look for the new Invite Key case.
- **Ornamental divider (new)** — a hedera/fleuron printer's ornament (❦, U+2766 FLORAL HEART) centered between two thin hairline rules (`outline` color), glyph itself in `on-surface-muted`. A classic old-world book-typesetting section-close mark, confirmed in [`mockups/context-entry.html`](mockups/context-entry.html). Used **only** bracketing Context Entry and the Orientation Guide Results screen — deliberately absent from Quick Draw, sign-up, and the Admin Dashboard.

## Do's and Don'ts

- **Do** keep the Orientation Guide's essay text in `body-essay` at a constrained reading measure — it is the one place in the app where prose, not labels, is the content.
- **Do** keep the ornamental divider confined to the two LLM-touching screens — it marks something as considered/generated, not decorative wallpaper for the whole app.
- **Don't** introduce a light mode or a light/dark toggle — the app is dark-mode-only by design, not by omission.
- **Don't** reach for New Age mystical iconography (crystals, swirling stars, gradients, glow effects) anywhere, including the new ornamental motif — the brand posture is "systems-thinking diagnostic tool," and the Edwardian reference is formal/ritual, not mystical.
- **Don't** spend design effort polishing the Admin Dashboard beyond reusing existing components as-is — explicitly "ugly but functional" for this release.
