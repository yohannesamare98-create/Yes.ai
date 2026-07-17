# YES.AI Client Experience V2

## Stage 1 — Foundation fixes
- Added a single-state screen controller so loading, login and dashboard cannot display together.
- Added automatic session checking and client provisioning through `provision_yesai_client`.
- Added safe handling for `services`, `faqs`, `offers`, and qualification questions when Supabase returns text, null, or an unexpected value.
- Fixed Setup Wizard opening on mobile and added body scroll locking.
- Setup Wizard resumes from the saved `onboarding_step`.

## Stage 2 — Premium dashboard design
- Added premium blue/purple background gradients.
- Added glass-style login, cards, dashboard header, and navigation.
- Added operational status card with LIVE, SETUP NEEDED, CONNECTION ISSUE, and PAUSED states.
- Added responsive status details and actions.
- Added iPhone-safe full-screen wizard layout.

## Stage 3 — Experience polish
- Added an initial loading screen to prevent interface flashing.
- Added Google login, magic link, forgot password, and free-trial links.
- Added mobile safe-area spacing and prevented iPhone input zoom.
- Added button loading state for email login.
