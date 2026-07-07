---
project_name: 'tarot-spa'
user_name: 'Tony'
date: '2026-07-06'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 27
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

_Current state, not locked constraints — this is a solo-owned project and upgrades/replacements are fair game whenever a feature calls for it._

- React 19.2.0 + React DOM 19.2.0
- Vite 7.3.1, `@vitejs/plugin-react` 5.1.1
- Tailwind CSS 4.2.0 via `@tailwindcss/vite` (CSS-first config, no `tailwind.config.js`)
- Plain JavaScript/JSX — no TypeScript at runtime
- ESLint 9.39.1, flat config (`eslint.config.js`)
- No routing library, no state management library, no HTTP client, no test framework installed

## Critical Implementation Rules

### Language-Specific Rules

- Named exports for utils (`src/utils/*.js`), default exports for components (`src/components/*.jsx`, `App.jsx`)
- No TypeScript, no PropTypes — plain destructured props, no runtime/compile-time validation. Don't introduce `.tsx` or PropTypes without an explicit decision to do so
- Prefer deriving from data (`FULL_DECK`, `SPREADS` in `src/data/systemsTarot.js` and `src/utils/deck.js`) over hardcoding parallel structures
- No error-handling convention exists yet — e.g. `decodeDraw` returns `null` on bad input rather than throwing. There is currently no network/IO in the app, so no loading/error-state pattern to follow. This is a gap to fill deliberately once a backend is introduced, not something to copy blindly

### Framework-Specific Rules (React)

- Hooks usage is minimal — only `useState` anywhere in the codebase; no `useEffect`, `useContext`, `useReducer`, or custom hooks yet
- Components are flat, one level deep (`src/components/*.jsx`), no per-component subfolders, no colocated CSS/test files
- Small presentational helpers (icons, etc.) are defined as unexported functions at the bottom of the file that uses them, rather than split into separate files
- State management is pure prop-drilling from `App.jsx` — no Context API, no external state library. This has been fine at 3 levels of component depth but will likely need to change once auth/user state enters the picture
- No memoization anywhere (`useMemo`/`useCallback`/`React.memo` unused) — not a convention to preserve, just hasn't been needed yet

### Testing Rules

- No test framework installed, no test files exist. No convention to follow or break — this is greenfield territory whenever tests get introduced

### Code Quality & Style Rules

- ESLint flat config (`eslint.config.js`), `no-unused-vars` set to `error` (exception for names matching `^[A-Z_]`). No Prettier — formatting isn't automated
- Flat, purpose-based folders: `src/components/`, `src/utils/`, `src/data/` — no feature-folder or domain-folder structure
- Naming: PascalCase for component files/functions, camelCase for utils/data functions, SCREAMING_SNAKE_CASE for exported constants (`SPREADS`, `FULL_DECK`)
- Minimal-to-no comments — code relies on naming/structure to be self-explanatory

### Development Workflow Rules

- All commits land directly on `main`, no PR-based workflow currently. Commit messages are imperative-mood, capitalized subjects, no conventional-commit prefixes
- Deployment is fully automated via `.github/workflows/deploy.yml`: push to `main` → `npm ci && npm run build` → `actions/deploy-pages`. No staging environment, no secrets/env vars configured
- The deploy pipeline currently assumes a pure static build with no backend. Multiuser work (auth, persistence) will require extending this pipeline or adding a separate backend deployment path — an architecture-level decision, not a style rule

### Critical Don't-Miss Rules

- **Hardcoded base path:** `vite.config.js` sets `base: '/tarot-spa/'` for GitHub Pages. Any new routing or asset/URL handling must account for this — naive absolute paths or routers will 404 in production
- **Draw codes are the only existing "sharing" mechanism:** `encodeDraw`/`decodeDraw` in `deck.js` pack spread+cards+inversion into a URL-safe string, fully client-side, no server involved. Multiuser design must decide whether this stays as an anonymous/fallback share path or gets superseded by real persistence
- **No secrets exist anywhere in this repo or pipeline today** — introducing a backend/auth provider means secrets management is new territory, not an existing pattern to extend
- **No network calls exist in the codebase at all** — no fetch wrapper, no loading UI convention, no retry/error-handling convention. This is the biggest gap multiuser work needs to fill from scratch

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code in this project
- Treat the Technology Stack section as current state, not a locked constraint — Tony owns this project solo and upgrades/replacements are fine when a feature calls for it
- Follow the Critical Implementation Rules as documented; when in doubt, prefer the more restrictive option
- Update this file if new patterns emerge, especially once multiuser/backend work begins

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when the technology stack or conventions change
- Revisit once multiuser/backend architecture is decided — several sections here (testing, error handling, workflow) are placeholders describing "nothing exists yet" and will need real rules once that work starts

Last Updated: 2026-07-06
