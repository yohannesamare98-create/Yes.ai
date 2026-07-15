# YES.AI Milestone 3 — Automatic Signup

This package adds:

- Google signup
- Email + password signup
- Email verification
- Automatic client creation
- Automatic `client_users` linking
- Automatic default bot configuration
- Automatic 14-day trial
- Automatic redirect to the client dashboard and setup wizard

## Files

1. `client-dashboard/signup.html`
2. `database/migrations/20260715_automatic_client_signup.sql`

## Upload to GitHub

Upload the two files into the exact paths shown above.

Recommended branch name:

`milestone-3-automatic-signup`

Then create a pull request and merge into `main`.

## Run the Supabase migration

Open:

Supabase → SQL Editor → New query

Copy the full contents of:

`database/migrations/20260715_automatic_client_signup.sql`

Click **Run**.

Expected result:

`Success. No rows returned`

## Enable Google login in Supabase

Open:

Supabase → Authentication → Providers → Google

Enable Google and add your Google OAuth Client ID and Client Secret.

In Supabase Authentication URL Configuration, add:

- Site URL: your client dashboard Vercel URL
- Redirect URL: `https://YOUR-CLIENT-DOMAIN.vercel.app/signup.html`

Example:

`https://yesai-clinte.vercel.app/signup.html`

## Email signup

In Supabase Authentication settings, keep email confirmation enabled.

After signup, the user receives a verification email. Clicking it returns the user to `signup.html`, provisions the business, starts the 14-day trial, and redirects to the dashboard.

## Important

Do not put any Supabase secret or service-role key inside these frontend files.

Use only:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` containing the publishable key

## Current limitation

The current dashboard may not automatically open the wizard from the `?onboarding=1` query parameter. The user will still land inside the dashboard and can click **Setup Wizard**. A small follow-up update can make the wizard open automatically on first login.
