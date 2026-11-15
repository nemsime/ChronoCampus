# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-11-15
- Primary product surfaces: local ChronoCampus sign-in, timetable, planner, catalogs, diagnostics, support and account.
- Evidence reviewed: `docs/requirements.md`, `frontend/src/system/*`, existing local desktop/mobile screenshots. `src/App.tsx` uses `system/Application`; older prototype components are not active.

## Brand
- Calm, precise university workspace. The user-selected palette is pale sage `#EEF1EA`, forest text `#1F2D26`, terracotta `#B84A24` and peach `#F6DCCB`.
- Trust comes from readable data, explicit publication state and clear feedback.
- Avoid gradients, decorative dashboards, invented metrics, oversized cards, marketing copy and animation for its own sake.

## Product goals
- Help students/lecturers find lessons and notes; help administrators prepare, inspect and publish schedules confidently.
- Improve hierarchy, legibility and responsive navigation without changing business rules, API contracts or permissions. Demo-only account additions are documented separately.
- Success: primary actions and current selection are clear; loading differs from empty/error; forms and tables remain usable at 360px and on desktop.

## Personas and jobs
- Students and lecturers: check published lessons, manage private notes, contact support.
- Administrators: manage reference data, generate drafts, inspect conflicts, publish and diagnose operations.
- Context: local browser, Russian/Armenian/English, keyboard and touch.

## Information architecture
- Preserve role visibility. Administrators have University management and Semester setup in place of Data & rules; timetable, planner, diagnostics, suggestions, support and account remain available to their authorized roles.
- University management uses four searchable areas: People, Academic structure, Rooms & equipment, Subjects. Related child records stay within their area rather than a long second sidebar.
- Semester setup uses Calendar & dates, Teaching load, Availability & exceptions. Keep the selected semester visible; scope period/load/exception rows to it and explicitly identify shared calendars and overlapping availability.
- Support is a normal navigation item. Do not restore the promotional help/contact box.
- New drafts follow Semester → Groups → Review → Generate. Review shows the actual selected inputs; advanced solver controls are collapsed. Generating never publishes automatically.
- Login, registration and recovery use one centered card below a compact brand/language header. Do not restore a split-page illustration or half-page panel. Clear successful forms and start each auth mode with fresh fields; retain failed submissions for correction.
- The schedule defaults to a chronological vertical timeline with terracotta dots. Keep the week grid as an explicit alternative and remember the user's view choice. Secondary timeline filters are collapsed; primary group/lecturer/room controls remain visible.
- Generated drafts open with a compact result summary and the timetable first. Review issues expands the hours/unresolved-lesson report. Publication remains a separate, server-validated action.
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
- Colors: exact sage/forest/terracotta/peach palette above, warm white surfaces and neutral top/side toolbars. Use peach for selected navigation and terracotta for primary actions/focus; retain distinct semantic green/amber/red.
- Typography: locally hosted Bricolage Grotesque headlines and Inter body, with Armenian/system fallbacks; body 14px, inputs 14px (16px mobile), headings 26–32px, metadata at least 12px. Font files and SIL licenses are in `frontend/public/fonts`.
- Spacing: 4px base, 8/12/16/24/32 rhythm; 24px surface padding, 16px on phones; constrained content width.
- Shape: pill buttons, 8px inputs, 16–24px panels; thin borders and restrained shadows.
- Motion: short hover/focus transitions and busy indicator; respect reduced motion.
- Icons: existing Lucide icons, 16–20px, meaningful uses only; decorative icons hidden from assistive technology.

## Components
- Extend existing `common.tsx`, `LanguageSwitch` and `styles.css` rather than introducing another design system.
- Shared loading/empty states, labelled password visibility, native dialog close control, consistent toolbar and button treatments.
- Explicit hover, focus, selected, busy, disabled, empty and error states.
- Base layout lives in `styles.css`, shared palette tokens in `workspace.css`, and the selected typography/timeline/auth treatment in `theme.css`; UI strings merge through existing i18n.

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
- React 18, TypeScript, Vite, existing Lucide and plain CSS. No added dependencies or changes to scheduling rules, domain API contracts, schema or production academic data. Register new UI pages/modules with the safe client-error allowlists.
- Preserve solver controls, idempotency, cancellation, pagination and authorization behavior.
- Validate TypeScript, production build, translated component rendering and targeted interactions where tooling permits.
- The connected browser surface is unavailable. Native headless Chrome is available for isolated source/UI checks with a separate profile; distinguish API fixtures from live database acceptance and report actual verification boundaries.

## Open questions
- Preserve the existing calendar mark. Fonts were obtained from the official Google Fonts repository with their licenses; future palette/layout changes should follow user direction.
- Fresh desktop/mobile checks can use native headless Chrome; signed-in production flows, print and accessibility acceptance must be reported separately.
