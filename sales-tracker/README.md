# Horeca Sales Call Tracker

Responsive, installable React PWA backed by Supabase Auth and Postgres. Staff accounts are created with email and password; new accounts receive the `staff` role and can access only contacts assigned to them. Admin access is granted separately in the database.

## Supabase setup and GitHub deployment

The schema and Auth settings are version-controlled. The root GitHub Actions workflow pushes Auth configuration and applies migrations whenever `sales-tracker/supabase/` changes on `master`, or when manually dispatched. It does not require editing the Supabase project in the portal.

See the step-by-step guides for [Vercel deployment](./docs/vercel-deployment.md) and [Supabase deployment](./docs/supabase-deployment.md).

1. Use the existing Supabase project for this app. The included GitHub Actions workflow targets it using its project ref; no native Supabase GitHub integration is required.
2. In the GitHub repository, add these Actions secrets:
   - `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token for the deployment CLI.
   - `SUPABASE_DB_PASSWORD`: the database password for the project.
   - `SUPABASE_PROJECT_ID`: the project's ref, not its display name.
3. Add this Actions variable:
   - `SUPABASE_AUTH_SITE_URL`: `https://horeca-bice.vercel.app`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` in this directory. Use the project's public/anon key; never put the service-role key in this client app.
5. Push a change to `sales-tracker/supabase/` on `master` or manually run **Deploy Supabase** from the repository's Actions tab. The workflow applies the CRM schema and policies from [`supabase/migrations/`](./supabase/migrations/) and sets email/password signup with email confirmation disabled from [`supabase/config.toml`](./supabase/config.toml).
6. Create your account from the app's **Create account** screen. New accounts receive the `staff` role. To grant the first administrator role without using the Supabase portal, connect with `psql` and run `psql "$DATABASE_URL" -v admin_email='admin@example.com' -f supabase/promote-admin.sql`.

7. Start locally with `npm run dev` from this directory, then use the admin dashboard to import CSV leads and assign them to staff.

Keep `SUPABASE_AUTH_SITE_URL` current in GitHub if the deployed app URL changes. The Vercel production URL and local development URLs are included as allowed redirects.

## Included workflows

- Email/password sign-in and account creation
- Admin CSV import, lead assignment, activity totals, and contact filtering
- Staff calling queue, click-to-call, call outcomes, follow-up scheduling, and contact history
- Indian mobile-number normalization and duplicate detection during CSV parsing
- PWA manifest, app icon, and offline app-shell caching
