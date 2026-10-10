# Supabase Git-based setup

The Supabase schema and email-auth settings live in version control. Do not paste SQL into the Supabase portal.

For the full procedure, see [Supabase deployment](../docs/supabase-deployment.md).

1. Use the existing Supabase project and note its project ref and database password.
2. Add GitHub Actions secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_ID` to this repository.
3. Add the GitHub Actions variable `SUPABASE_AUTH_SITE_URL` with `https://horeca-bice.vercel.app`.
4. Push changes under `sales-tracker/supabase/` to `master`, or manually dispatch the **Deploy Supabase** workflow. It deploys `config.toml` and applies the SQL migrations.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `sales-tracker/.env.local`. Use only the publishable/anon key in the browser.
6. Sign up in the app. New accounts are staff by default. To promote the first administrator without the portal, use `psql "$DATABASE_URL" -v admin_email='admin@example.com' -f supabase/promote-admin.sql`; do not place database credentials in the app.

Email/password signup is enabled and email confirmation is disabled by the checked-in Auth config. The production Vercel URL and local development URLs are included as allowed redirects. Keep the GitHub Actions URL variable current when the app's public origin changes.

For local development, run the app from `sales-tracker/` with `npm run dev`.
