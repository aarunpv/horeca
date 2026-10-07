# Supabase Setup

## 1. Configure the app

Set these values in `sales-tracker/.env.local` using the project URL and publishable key from Supabase Project Settings → API:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

Never use a `service_role` or secret key in this browser app. Restart Vite after changing environment values.

## 2. Create the database objects and policies

Open the Supabase SQL Editor for the same project and run `supabase/setup.sql`. If the project's Data API restricts exposed schemas, ensure `public` is exposed in the project's API settings as well.

The script enables RLS and grants authenticated access only. Admins may import and assign contacts. Staff may read and update contacts assigned to their own Auth user ID. Anonymous users have no access.

## 3. Create users and profiles

Create users in Supabase Authentication → Users. Email/password sign-in must be enabled, and users must have a confirmed email if email confirmation is enabled.

After creating your first Auth user, replace the email and display name below and run this in SQL Editor to make that user an admin:

```sql
insert into public.profiles (id, name, role, is_active)
select id, 'Admin Name', 'admin', true
from auth.users
where lower(email) = lower('admin@example.com')
on conflict (id) do update
set name = excluded.name, role = excluded.role, is_active = true;
```

Create each staff member in Authentication → Users, then add their matching profile with role `staff`:

```sql
insert into public.profiles (id, name, role, is_active)
select id, 'Staff Name', 'staff', true
from auth.users
where lower(email) = lower('staff@example.com')
on conflict (id) do update
set name = excluded.name, role = excluded.role, is_active = true;
```

The Auth user ID and profile ID must match. Assign imported contacts to that same staff profile ID from the admin dashboard. There is no public sign-up or client-side role selection.

## 4. Sign in

Restart the app, sign in with the Auth user's email and password, and verify that the account has an active profile. The app shows the admin dashboard only for profiles with role `admin`; all other active profiles receive the staff queue.
