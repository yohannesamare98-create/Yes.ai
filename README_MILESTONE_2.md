# YES.AI Milestone 2 — Fast Onboarding Wizard

Upload only these changed files to a new GitHub branch:

- `client-dashboard/index.html` (replace existing file)
- `database/migrations/20260714_fast_onboarding_wizard.sql` (add new file)

## What changed

- Upgraded the existing wizard from 6 steps to a fast 7-step WhatsApp-first flow.
- Added owner, country, city, website choice, timezone and structured business hours.
- Added autosave after edits and resume from the last saved step.
- Added industry FAQ suggestions.
- Removed Calendar and Sheets from the onboarding critical path.
- Website remains optional.
- WhatsApp remains the only required launch channel.
- No backend, Railway, Meta webhook, landing page or admin dashboard files are changed.

## Required order

1. Upload the two files to a branch named `milestone-2-fast-onboarding`.
2. Run the SQL migration in Supabase SQL Editor.
3. Preview/test the client dashboard.
4. Merge only after testing.

## Test checklist

- Wizard opens for `needs_setup` and `in_progress` clients.
- Progress resumes from the saved step.
- Website can be skipped.
- Calendar and Sheets are not required.
- Business information, services, hours, FAQs, AI tone and alerts save.
- Launch requires WhatsApp and starts trial status.
