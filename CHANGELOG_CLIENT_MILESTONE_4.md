# YES.AI Client Milestone 4

## Client authentication
- Added Continue with Google to the client login page.
- Added email/password login validation and loading states.
- Added passwordless magic-link login.
- Added forgot-password email flow and in-page password recovery.
- Added Start 14-Day Free Trial link to the signup page.
- Added secure session loading screen to avoid flashing the login page.
- Added automatic client provisioning through `provision_yesai_client` when an authenticated user has no `client_users` row yet.
- Added automatic routing into the setup wizard for unfinished accounts.

## Client dashboard
- Removed the technical Supabase/RLS banner from the customer view.
- Added a customer-friendly operational status card with LIVE, SETUP NEEDED, CONNECTION ISSUE, and PAUSED states.
- Added View Setup and Test Connections actions.

## Mobile experience
- Improved login spacing and full-width layout on phones.
- Prevented horizontal overflow.
- Prevented iPhone input zoom.
- Made the setup wizard full-screen on small screens.
- Added safe-area padding to wizard controls.

## Files changed
- `client-dashboard/index.html`
- `CHANGELOG_CLIENT_MILESTONE_4.md`
