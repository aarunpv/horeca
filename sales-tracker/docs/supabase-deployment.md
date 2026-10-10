# Deploy Supabase schema and Auth settings

The database schema and Auth configuration are maintained in:

- [`supabase/migrations/`](../supabase/migrations/)
- [`supabase/config.toml`](../supabase/config.toml)
- [GitHub Actions workflow](../../.github/workflows/supabase-deploy.yml)

The workflow deploys the checked-in Auth configuration and applies pending database migrations, including indexes used by paginated contact, call-history, activity-calendar, order, and staff-report queries, plus the admin-only append-only event log table and activity triggers. It does not require editing settings or running SQL in the Supabase portal.

## One-time GitHub configuration

In the GitHub repository `aarunpv/horeca`, open **Settings → Secrets and variables → Actions**.

Add these **repository secrets**:

| Name | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token used by the CLI |
| `SUPABASE_DB_PASSWORD` | Database password for the target Supabase project |
| `SUPABASE_PROJECT_ID` | Project ref from the Supabase project URL |

Add this **repository variable**:

| Name | Value |
| --- | --- |
| `SUPABASE_AUTH_SITE_URL` | `https://horeca-bice.vercel.app` |

For this project's Supabase URL, `https://blrgymfvbsllwzneseyl.supabase.co`, the project ref is `blrgymfvbsllwzneseyl`. Do not use the project display name. Do not paste secrets into source files, `.env.local`, Vercel, commits, or chat.

## Deploy changes

The GitHub Actions workflow runs automatically when files under `sales-tracker/supabase/` or the workflow itself change on `master`. It can also be run manually:

1. Push the migration/config/workflow files to GitHub.
2. In GitHub, open **Actions → Deploy Supabase → Run workflow**.
3. Choose `master`, then run the workflow.
4. Confirm these steps pass:
   - Link Supabase project
   - Deploy Auth configuration
   - Apply database migrations

If the linking step fails, verify the three secret names, their values, and that the database password belongs to the same project ref. If migrations fail, read the workflow log before retrying; do not reset the database as a troubleshooting shortcut.

The config enables email/password signup and disables email confirmation. The signup trigger automatically creates new profiles with the `staff` role. Staff have no admin privileges unless their role is changed through the trusted admin procedure below.

## Promote the first admin without the Supabase portal

1. Create the user through the app's **Create account** screen.
2. From a trusted machine with `psql` installed, connect using the Supabase PostgreSQL connection details and run:

   ```bash
   psql "$DATABASE_URL" \
     -v admin_email='admin@example.com' \
     -f sales-tracker/supabase/promote-admin.sql
   ```

   Replace the example email with the exact account email. Set `DATABASE_URL` privately in the terminal; it contains the database password. Do not put the connection string into the repository or share it in chat.
3. Sign out and back into the app. The promoted account should see the admin dashboard.

The promotion SQL is intentionally not run automatically: deploying schema must not silently grant admin privileges to an arbitrary account.

## Local development configuration

In `sales-tracker/.env.local`, set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

These are frontend connection settings, not deployment credentials. `.env.local` is Git-ignored. Restart the Vite dev server after changing the file. Never use a service-role or secret key in the browser app.

For frontend deployment, see [Vercel deployment](./vercel-deployment.md).
