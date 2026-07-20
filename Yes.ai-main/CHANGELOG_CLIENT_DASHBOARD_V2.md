# YES.AI Client Dashboard V2

## Fixed
- Login and dashboard can no longer render together.
- Added a dedicated loading state while the session is checked.
- Safely handles `offers`, `services`, FAQs, and qualification questions when Supabase returns text, null, or invalid data instead of an array.
- Setup Wizard opens reliably on iPhone Safari and locks background scrolling.
- Setup Wizard uses a full-screen mobile layout with safe-area spacing and fixed action buttons.

## Added
- Continue with Google.
- Email/password login.
- Magic-link login.
- Forgot-password email flow.
- Link to the 14-day trial signup page.
- Automatic provisioning attempt for authenticated users without a client mapping.
- Premium operational status card with LIVE, SETUP NEEDED, CONNECTION ISSUE, and PAUSED states.
- Premium blue, violet, and soft-glass dashboard styling.

## Preserved
- Existing Supabase configuration and database access layer.
- Existing dashboard tabs, setup wizard fields, integrations, leads, appointments, billing, and admin project files.
