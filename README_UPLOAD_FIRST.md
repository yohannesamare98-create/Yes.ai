# YES.AI Milestone 1 — upload only these changed files

This is **not** a complete replacement project. Copy only the included files into the same paths in your existing GitHub repository.

## Files to add
- `backend/middleware/auth.js`
- `database/migrations/20260714_secure_whatsapp_mvp.sql`
- `backend/.env.example`

## Files to replace
- `backend/routes/clientRoutes.js`
- `backend/routes/whatsappWebhook.js`
- `backend/lib/botEngine.js`

## Do not change
- Landing page
- Client dashboard
- Admin dashboard
- Railway service/domain
- Supabase project
- Meta webhook URL (`/webhook`)

## Order
1. Upload files to a new GitHub branch.
2. Run the SQL migration in Supabase SQL Editor.
3. Confirm Railway environment variables already exist.
4. Deploy/test the branch.
5. Verify `/health`, webhook verification, one real WhatsApp message, and API authentication.
6. Merge to `main` only after tests pass.
