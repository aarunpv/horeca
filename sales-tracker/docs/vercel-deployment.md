# Deploy the PWA to Vercel

This app is a Vite/React single-page application. Its production URL is <https://horeca-bice.vercel.app>.

## Required settings

- Root directory: `sales-tracker`
- Framework preset: Vite (or Other)
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install` (default)

## Connect the GitHub repository

1. In Vercel, add a project and import the `aarunpv/horeca` GitHub repository.
2. Set the root directory to `sales-tracker`.
3. Add these environment variables for Production (and Preview too, if preview deployments should connect to Supabase):
   - `VITE_SUPABASE_URL` — the Supabase project URL, for example `https://YOUR_PROJECT_REF.supabase.co`.
   - `VITE_SUPABASE_ANON_KEY` — the Supabase publishable/anon key.
4. Save the settings and deploy.
5. For later updates, push app changes to the connected branch and let Vercel build them, or run the Vercel CLI from the app directory:

   ```bash
   cd sales-tracker
   vercel --prod
   ```

   Link the directory to the existing `horeca-bice` Vercel project if prompted.

## Verify the deployment

1. Open <https://horeca-bice.vercel.app> and confirm the app loads and the sign-in form appears.
2. Sign in with a provisioned user and verify the expected admin or staff view.
3. On a phone, install the PWA from the browser's install option (Chrome/Android) or Safari's **Share → Add to Home Screen** (iOS).
4. If you changed either Supabase environment variable, trigger a fresh Vercel build; Vite embeds `VITE_` variables into the frontend at build time.

Only the publishable/anon key belongs in these browser-exposed variables. Never add the Supabase service-role key, database password, or Supabase access token to Vercel. Those are not needed to build the frontend.

Vercel deployment publishes the frontend only. Deploy database migrations and Supabase Auth settings separately using [the Supabase procedure](./supabase-deployment.md).
