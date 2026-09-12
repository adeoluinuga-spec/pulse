# Shared Appraisal theme

The interface now uses the Appraisal workspace's navy, cobalt, cool neutral palette and restrained card/typography treatment.

## Presentation scope

- Shared shell, sidebar, top bar, mobile navigation and notification surfaces.
- Employee, manager, executive and HR dashboards, including organisation setup.
- Profile, performance, reports, team, wellbeing and 360 status screens.
- Assessment setup, instrument editing, cycles, participants, nominations, bulk assignments and report consoles.
- Reviewer forms, queues, contact page and PDF-generation screen.
- Sign-in, password reset, onboarding, welcome, admin and settings.
- Shared buttons, fields, tabs, tables, cards, metrics, modal, skeleton and empty states.
- Organisation editor chrome, preserving its selectable chart themes.
- Goals already uses the same Appraisal visual language in the newly committed GoalsWorkspace; its functionality is preserved.

Redirect-only routes inherit the appearance of their destination. Generated PDF documents remain separate output artifacts; only their in-app generation interface is restyled.

## Visual conventions

| Element | Treatment |
| --- | --- |
| Canvas | #f5f7fb |
| Panels | White, cool borders, light shadows |
| Hero surfaces | #142641 navy |
| Primary actions | #245de8 cobalt |
| Main text | #182438 |
| Secondary text | #66758a |
| Borders | #dfe6ef |
| Controls | 6px corners; visible keyboard focus |
| Cards | Usually 8–10px corners |
| Page titles | Responsive 27–37px, modest weight, tight tracking |

Shared tokens live in src/app/globals.css. Tailwind utilities on individual components use those tokens. Broad legacy overrides that forced dark panels white, flattened gradients/shadows and applied a minimum height to every hyperlink have been removed. Existing status colours, avatar identities, organisation chart theme choices and control states remain distinct.

The sidebar has slightly more room for navigation labels, dashboard content no longer accumulates multiple desktop gutters, and mobile form text stays readable without iOS focus zoom. Reduced-motion preferences are respected.

## Behaviour boundary

This delivery changes classes, visual attributes, CSS and the appearance description in Settings. It does not change route destinations, authentication, role checks, handlers, API requests, validation, state transitions, scoring, data models or database migrations.

The independently committed goals, appraisal-linking, KPI and strategy work is preserved. The presentation guard uses commit 12c61a3 as its comparison base to exclude that separate work.

No database migration is required for this theme.

## Verification

- scripts/tests/interface-presentation.mjs compares the TypeScript syntax tree before/after, excluding presentation attributes, class constants and the Settings appearance description. It verifies that the remaining syntax matches and no API/data/business module is changed.
- scripts/tests/interface-browser.mjs checks 31 route URLs at desktop and mobile sizes: 62 visits, with no client exceptions or document overflow. It also checks profile-menu navigation and keyboard focus.
- Browser checks use synthetic session/profile data and intercept external browser traffic. They cover available, empty and access/error states; they are not a production tenant audit or a claim that every populated server-only screen was exercised.
- Existing Appraisal browser tests pass: HR modal/evidence, manager draft, employee acknowledgement and mobile layout.
- Existing Organisation Structure browser tests pass: desktop/mobile editor, cycle rejection, edits, draft/resume, publish review, incomplete-template guard, undo and removal.
- Full unit regression suite: 309 pass, one existing integration skip.
- Production build and TypeScript checks pass.
- Full lint retains seven existing errors and 15 warnings. The before/after comparison across 59 edited TSX files found no new lint findings.

Run the boundary check with:
node scripts/tests/interface-presentation.mjs

For browser verification, use the optional Playwright installation described in ORGANISATION_STRUCTURE.md, start the local dev server on port 3100 with its existing development auth bypass, then run:
node scripts/tests/interface-browser.mjs

The harness reads only NEXT_PUBLIC_SUPABASE_URL from .env.local to route synthetic responses. It does not use real account credentials or submit live mutations. Local screenshots and browser results stay outside the repository.
