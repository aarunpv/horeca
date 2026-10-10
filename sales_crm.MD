# Sales calls tracking PWA
I want to setup a lightweight and responsive PWA (progressive web app)

## Current implementation status (2026-10-10)

The working application is in [`sales-tracker/`](./sales-tracker/). It is a React/Vite PWA using Supabase Auth and Postgres, with production URL <https://horeca-bice.vercel.app>.

### Implemented

- Email/password sign-in and sign-up. The database trigger creates new profiles as `staff`; admin promotion is a separate privileged operation.
- Role-based access for admins and staff, enforced by Supabase row-level security. Staff can access their assigned contacts; admins can access all contacts.
- CSV import with Indian mobile-number normalization, invalid-row handling, duplicate review, and choices to merge/keep/ignore.
- Admin dashboard with clickable metric cards and detail views for contacts/calls; category, zone, status, and assignee filters; bulk assignment and unassignment. Call action items are Interested, Not Interested, Wrong Number, and No Answer / Callback; outcomes are Quote Sent, Followup Required, Order Placed, Meeting Requested, Try Again Later, and Callback Requested.
- A single Staff Activity card on the admin dashboard opens a staff list; selecting an individual opens a full-screen report with current assignments, lead status counts, all-time call outcomes/actions, call history, and CSV/PDF downloads. The dashboard also alerts when active staff have no assigned contacts or no remaining contacts in Not Contacted status.
- Dashboard card groups use vertical lists with expand/collapse controls.
- Admin and staff dashboards include an activity calendar for calls and scheduled follow-ups, filterable by today, specific date, and date range. Admins can filter by staff and metric; staff can filter by metric only.
- Staff calling queue with a visible slide-out Contacts filter menu, full-width responsive contact cards, click-to-call, outcome/actions, notes, follow-up scheduling, Google Calendar event link, and append-only call history.
- Responsive contact-card layouts for mobile, plus a PWA manifest, install icon, and service worker app-shell cache.
- Light and dark themes across sign-in, admin, and staff screens, with a persistent user preference and system-preference default; dashboard lists use full-width orange, blue, green, red, and purple cards with a subtle lift, while dark mode retains navy app surfaces.
- Supabase schema, RLS, Auth configuration, and GitHub Actions deployment workflow are maintained in source control.

### Important current limitations

- The PWA cannot read carrier call logs or automatically obtain answered state or call duration. Call outcomes are entered by staff. Accurate call telemetry requires a telephony provider integration.
- The Google Calendar link opens a draft event; direct two-way calendar synchronization and automatic reminders are not implemented.
- Dashboard metrics currently cover the implemented summaries; custom date-range metric summaries and the full reporting suite described below remain future work. The activity calendar does support date and date-range activity browsing.
- Admin user lifecycle management and full contact edit/delete screens are not yet implemented.
- Supabase changes deploy through GitHub Actions when the deployment workflow and Supabase files are pushed to `master`; configuring the required GitHub secrets/variable is a prerequisite.

### Deployment procedure guides

- [Publish/update the PWA on Vercel](./sales-tracker/docs/vercel-deployment.md)
- [Deploy Supabase schema and Auth configuration through GitHub](./sales-tracker/docs/supabase-deployment.md)
- [Use admin staff activity and download reports](./sales-tracker/docs/admin-dashboard.md)
- [Use the staff calling queue](./sales-tracker/docs/staff-calling.md)

### Documentation maintenance

When CRM features are added or changed, update this status and the relevant user/deployment documentation in the same change so they remain aligned with the app.

The sections below retain the original product requirements and roadmap. Items not listed under “Implemented” above should be treated as requested/planned functionality, not as a claim that it is already available.

I have a set of csv files containing the following headers
    Category,Zone,Name,Phone,Address,Rating,Reviews

I want to setup a CRM 
    import the csv data
    create RBAC to the data
    roles - admin, staff
    admin - full access to the data
    staff - limited access - to append

I want to use a DB to store the data

## Call workflow

**Not Contacted** is the initial contact state. After a call, staff selects exactly one of these four call action items:

- Interested
- Not Interested
- Wrong Number
- No Answer / Callback

Applicable outcomes are:

- Quote Sent
- Followup Required
- Order Placed
- Meeting Requested
- Try Again Later
- Callback Requested

Interested calls can have Quote Sent, Followup Required, Order Placed, or Meeting Requested outcomes. No Answer / Callback calls can have Followup Required, Try Again Later, or Callback Requested outcomes. Not Interested and Wrong Number calls do not require a separate outcome. A follow-up date/time is required for No Answer / Callback and for outcomes that schedule another contact. Staff can add notes and open a Google Calendar event draft for a scheduled follow-up.

## Activity dashboard

The admin and staff activity calendars can show calls and scheduled follow-ups by today, a selected date, or a date range. The admin can filter by staff; both roles can filter by metric, action item, and outcome.

The staff contact queue includes To Call, Follow-up, each of the four call action items, Orders, and All. Orders are contacts with a logged Order Placed outcome; Order Placed is not a call action item.

## CSV import and contact list

The PWA imports CSV data into the database, validates Indian mobile numbers, and supports duplicate phone-number review with merge/keep/ignore choices. Contact cards show the current call action item (or Not Contacted before a first call), scheduled follow-up when present, and options to call/update or review history.

### History
Do not overwrite the previous call information

Examples
```
ABC Traders

Current status: 🟡 Interested

CALL HISTORY
────────────────────
06 Oct  10:32 AM
Action item: No Answer / Callback

06 Oct  2:15 PM
Action item: No Answer / Callback
Outcome: Callback Requested
Follow-up: 07 Oct 11:00 AM

07 Oct  11:05 AM
Action item: Interested
Outcome: Quote Sent

```

## Design

                    CONTACTS
                       │
                       ▼
                  📞 MAKE CALL
                       │
                       ▼
                  CALL OUTCOME
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    Interested    Not Interested    Wrong Number    No Answer / Callback
        │              │
        │              ▼
        │        Schedule Follow-up
        │              │
        └──────────────┤
                       ▼
                 📅 CALENDAR
                       │
                       ▼
                 Follow-up
                       │
                       ▼
                    📞 CALL
                       │
                       ▼
                 Update status

Synchronize changes from calendar event with PWA


## Approach

Phase 1 (core parts implemented; see status above)

CSV import
Contact database
Click-to-call
Status
Actions
Notes
Call history
Follow-up date/time

Phase 2 (partially implemented; direct synchronization and reporting pending)

Google Calendar "Add event"
Follow-up dashboard
Today's calls
Overdue follow-ups

Phase 3 (planned)

Direct Google Calendar integration
Automatic reminders
Reporting/dashboard
Multiple users, if needed


## Roles definition

1. User roles

Staff

Staff can:

See contacts assigned to them
Call contacts
Update call status
Add notes
Schedule follow-ups
Use the four call action items and six applicable outcomes listed in the Call workflow section
See their own call history and follow-ups

They should not be able to see or modify other staff's activity unless you want that.

Admin

Admin can:

Import CSV
View all contacts
Assign contacts to staff
Add/remove staff
See every staff member's activity
See call statistics
See overdue follow-ups
See counts for each of the four call action items and six outcomes
Identify duplicate phone numbers
Reassign contacts
Edit/delete contacts


## Duplicate phone-number detection
This should happen automatically when you import the CSV.

For example, if your CSV contains:

ABC Traders       9876543210
XYZ Enterprises   9876543210
MNO Stores        +91 9876543210
PQR Traders       09876543210

The system should recognize that these may represent the same phone number, rather than treating them as four different numbers.

We should therefore normalize phone numbers before checking duplicates.

For India, we'd normalize variations such as:

9876543210
+919876543210
919876543210
09876543210

into a common format.

Then the import screen could say:

⚠️ 23 duplicate phone numbers found

And show:

Phone	Contacts	Action
9876543210	ABC Traders, XYZ Enterprises	Review
9988776655	MNO Stores, PQR Traders	Review

You can then decide:

Merge / Keep both / Ignore

I would not automatically delete duplicates.


## Duplicate detection should also happen later

Suppose staff tries to add a new contact:

9876543210

The system should immediately say:

⚠️ This phone number already exists.

And show:

ABC Traders
Assigned to: Rahul
Status: Interested
Last contacted: 6 Oct

This can prevent staff from accidentally creating duplicate customers.

## Admin dashboard
```
SALES DASHBOARD

Today
────────────────────────

Calls                  147
Interested              24
Not Interested          41
Wrong Number             8
No Answer / Callback    38
Orders                   8

FOLLOW-UPS
────────────────────────

Due today               17
Overdue                  9
Upcoming                43


STAFF ACTIVITY
────────────────────────

Rahul
Calls: 42
Interested: 8
Orders: 3

Amit
Calls: 37
Interested: 6
Orders: 2

Priya
Calls: 31
Interested: 5
Orders: 1
```
## Activity history

Who did what and when
```
ABC Traders

06 Oct 10:32
Rahul → Called
Action item: No Answer / Callback

06 Oct 14:15
Rahul → Called
Action item: No Answer / Callback
Outcome: Callback Requested

06 Oct 14:16
System → Calendar reminder created

07 Oct 11:03
Rahul → Called
Action item: Interested
Outcome: Quote Sent

08 Oct 16:20
Amit → Updated
Outcome: Order Placed
```
## Contact assignment

Assigments with filters based on the DB fields - zone, category

I'd structure the database around:

Contact → Assignment → Calls → Actions → Follow-ups → Calendar events

rather than putting everything into one contact record.

That gives us flexibility later for things like:

- Multiple calls to the same customer
- Different staff members handling the same customer
- Reassignment
- Complete activity history
- Performance reporting
- Follow-up reminders
- Order tracking

Overall architecture
```
                    PWA
                     │
          ┌──────────┴──────────┐
          │                     │
        ADMIN                  STAFF
          │                     │
          └──────────┬──────────┘
                     │
                  Backend
                     │
              ┌──────┴──────┐
              │             │
           Database      Google Calendar
              │
      ┌───────┼────────┐
      │       │        │
 Contacts   Calls   Activities
      │
 Duplicate detection

 ```
