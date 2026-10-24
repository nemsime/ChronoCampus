# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-10-24
- Primary product surfaces: local ChronoCampus sign-in, timetable, planner, catalogs, diagnostics, support and account.
- Evidence reviewed: `docs/requirements.md`, `frontend/src/system/*`, existing local desktop/mobile screenshots. `src/App.tsx` uses `system/Application`; older prototype components are not active.

## Brand
- Calm, precise university workspace. Retain the dark teal navigation and restrained teal actions.
- Trust comes from readable data, explicit publication state and clear feedback.
- Avoid gradients, decorative dashboards, invented metrics, oversized cards, marketing copy and animation for its own sake.

## Product goals
- Help students/lecturers find lessons and notes; help administrators prepare, inspect and publish schedules confidently.
- Improve hierarchy, legibility and responsive navigation without changing business rules, API contracts, permissions or database data.
- Success: primary actions and current selection are clear; loading differs from empty/error; forms and tables remain usable at 360px and on desktop.

## Personas and jobs
- Students and lecturers: check published lessons, manage private notes, contact support.
- Administrators: manage reference data, generate drafts, inspect conflicts, publish and diagnose operations.
- Context: local browser, Russian/Armenian/English, keyboard and touch.

## Information architecture
- Preserve existing navigation and role visibility: timetable, planner, data/rules, diagnostics, support, account.
- Persistent desktop sidebar can collapse to a labelled icon rail; remember the choice locally. Mobile navigation remains a separate full-label disclosure.
- Keep one page scroll, with a compact sticky header and section links on long planner/diagnostic pages. Do not stack large sticky panels or hide critical generation/error status behind tabs.
- Paginate catalogs and lesson lists; place page controls above and below results. Open catalog editing in a modal so a row action never opens an unseen form far above it.
- Page title and short explanation first, then primary action, filters and actual data. Technical detail stays in diagnostics or existing expandable reports.

## Design principles
- Prefer visible labels and helpful empty states to unexplained controls.
- One strong primary action per section; secondary and destructive actions remain distinct.
- Preserve stable controls during asynchronous work; do not imply data is absent while loading.
- Keep existing native controls and lightweight shared components; no new UI dependencies.

## Visual language
- Colors: slate text on an off-white canvas, white surfaces, dark teal navigation, teal primary/focus, restrained semantic green/amber/red.
- Typography: local system sans-serif with Armenian fallback; body 14px, inputs 14px (16px mobile), headings 26–30px, metadata at least 12px.
- Spacing: 4px base, 8/12/16/24/32 rhythm; 24px surface padding, 16px on phones; constrained content width.
- Shape: 8px controls, 12px panels; thin borders and subtle shadows.
- Motion: short hover/focus transitions and busy indicator; respect reduced motion.
- Icons: existing Lucide icons, 16–20px, meaningful uses only; decorative icons hidden from assistive technology.

## Components
- Extend existing `common.tsx`, `LanguageSwitch` and `styles.css` rather than introducing another design system.
- Shared loading/empty states, labelled password visibility, native dialog close control, consistent toolbar and button treatments.
- Explicit hover, focus, selected, busy, disabled, empty and error states.
- Tokens and responsive layout owned by `frontend/src/system/styles.css`; UI strings by `uiWords.ts` merged into existing i18n.

## Accessibility
- Aim for WCAG 2.2 AA contrast and keyboard operation; do not claim certification.
- Visible focus, named icon buttons, current navigation semantics, skip link, labelled controls, semantic headings.
- Native modal dialogs preserve focus containment and Escape behavior; menu disclosure reports expanded state.
- Text accompanies status colors; readable wrapping for long names and Armenian labels; reduced-motion support.

## Responsive behavior
- Desktop above 1000px; compact tablet layout below; mobile navigation and stacked controls at 760px.
- Tables scroll inside their region; page itself must not scroll sideways. Do not hide essential data to fit.
- Long report tables and secondary catalog navigation can scroll within a bounded region with sticky table headings. Section targets and keyboard focus must clear the sticky navigation.
- At least 40px interactive controls, 44px touch targets on mobile. Avoid hover-only actions.

## Interaction states
- Loading: labelled status and busy affordance; no simultaneous misleading empty message.
- Empty: context and next action where available; search misses offer clearing the search.
- Error: existing safe translated errors with diagnostic references retained; retry through existing refresh controls.
- Success: existing response/validation states; no invented success before a request completes.
- Disabled: retain existing business constraints and communicate active requests.
- Slow network: loading remains visible; diagnostic stale-data messaging remains intact.

## Content voice
- Short, direct task language. Preserve domain terms: draft, published version, group, lesson, semester.
- Translate new visible and accessible strings into RU/HY/EN. No raw API keys in labels.

## Implementation constraints
- React 18, TypeScript, Vite, existing Lucide and plain CSS. No added dependencies, backend changes, API changes or production data changes.
- Preserve solver controls, idempotency, cancellation, pagination and authorization behavior.
- Validate TypeScript, production build, translated component rendering and targeted interactions where tooling permits.
- Browser automation is currently unavailable through the connected browser surface. Earlier screenshots are baseline evidence only; report fresh visual verification separately and honestly.

## Open questions
- No additional brand assets supplied; retain the existing mark and palette.
- Fresh browser screenshots depend on an available authorized browser surface; this does not block source implementation and static/render verification.
