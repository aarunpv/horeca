# Sales calls tracking PWA
I want to setup a lightweight and responsive PWA (progressive web app)

## Current implementation status (2026-10-10)

The working application is in [`sales-tracker/`](./sales-tracker/). It is a React/Vite PWA using Supabase Auth and Postgres, with production URL <https://horeca-bice.vercel.app>.

### Implemented

- Email/password sign-in and sign-up. The database trigger creates new profiles as `staff`; admin promotion is a separate privileged operation.
- Role-based access for admins and staff, enforced by Supabase row-level security. Staff can access their assigned contacts; admins can access all contacts.
- CSV import with Indian mobile-number normalization, invalid-row handling, duplicate review, and choices to merge/keep/ignore.
- Admin dashboard with clickable metric cards and detail views for contacts/calls; category, zone, status, and assignee filters; bulk assignment and unassignment.
- Staff calling queue with a left-side filter menu, click-to-call, outcome/actions, notes, follow-up scheduling, Google Calendar event link, and append-only call history.
- Responsive contact-card layouts for mobile, plus a PWA manifest, install icon, and service worker app-shell cache.
- Supabase schema, RLS, Auth configuration, and GitHub Actions deployment workflow are maintained in source control.

### Important current limitations

- The PWA cannot read carrier call logs or automatically obtain answered state or call duration. Call outcomes are entered by staff. Accurate call telemetry requires a telephony provider integration.
- The Google Calendar link opens a draft event; direct two-way calendar synchronization and automatic reminders are not implemented.
- Dashboard metrics currently cover the implemented summaries; custom date-range reporting and the full reporting suite described below remain future work.
- Admin user lifecycle management and full contact edit/delete screens are not yet implemented.
- Supabase changes deploy through GitHub Actions when the deployment workflow and Supabase files are pushed to `master`; configuring the required GitHub secrets/variable is a prerequisite.

### Deployment procedure guides

- [Publish/update the PWA on Vercel](./sales-tracker/docs/vercel-deployment.md)
- [Deploy Supabase schema and Auth configuration through GitHub](./sales-tracker/docs/supabase-deployment.md)

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
  Open contact and call
  Status - Not Contacted, Interested, Not Interested, No Answer / Callback, Wrong Number
  
  Interested Outcomes
  - Quote sent
  - Order placed 
  - Follow-up Call - Date Time - Block Calendar
  - Meeting Requested - Date Time - Block Calendar
  - Setup reminder
  - Notes

  Callback/ No Answer Outcomes
  - Follow-up Call - Date Time - Block Calendar
  - Setup reminder 
  - Notes 

  Wrong Number

  Not Interested - Outcomes
  - Notes - Reasons

## Activity Dashboard

Buttons - (TODAY) (Custom DATE) (Date Range)

Calls made       37
Interested       08
Not interested   15
Follow-ups       07
Orders           03
Wrong Numbers    02

And filters:

All | To Call | Follow-up | Interested  | No Answer / Call back  | Orders

## CSV Import
PWA imports data from CSV to DB

Phone number must be validated for Indian phone numbers
Option to Merge or Keep contacts with duplicate phone numbers

### Contact list
Each contact shows status 

name           status          action
name 001       not contacted   Call
name 002       quote sent      follow up
name 003       order placed    none
name 004       interested      follow up
name 005       wrong number    none
name 006       not interested  none

Click the contact name for action or action history

## After call flow

How did the call go?

🟢 Interested
🟡 Call back / No Answer
🔴 Not Interested
⚫ Wrong Number


### Status Screen
```
Interested

Next Action: 
☐ Quote sent
☐ Follow-up required
☐ Order placed
☐ Meeting requested

Follow-up date: 06/10/2026
Follow-up time: 5:30 PM

Add to Google calendar or calendar

Notes:
____________________

[ SAVE ]

```

```

No Answer / Callback

☐ Try again later
☐ Requested callback
☐ Responded with message

Next call:
- Date: ______
- Time: ______

Add to Google calendar or calendar

[ SAVE ]
```

```
Wrong Number

Notes:
____________________

[ SAVE ]
```

### History
Do not overwrite the previous call information

Examples
```
ABC Traders

Current status: 🟡 Interested

CALL HISTORY
────────────────────
06 Oct  10:32 AM
No Answer

06 Oct  2:15 PM
Interested
Requested callback
Follow-up: 07 Oct 11:00 AM

07 Oct  11:05 AM
Interested
Quote sent

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
    Interested       No Answer       Not Interested
                     Callback
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
Add actions such as:
Callback requested
Message received
Quote sent
Order placed
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
See interested/maybe/not-interested numbers
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
Answered                96
No Answer               38
Interested              24
Maybe                   31
Not Interested          41
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
Result: No Answer

06 Oct 14:15
Rahul → Called
Result: Maybe
Action: Callback requested

06 Oct 14:16
System → Calendar reminder created

07 Oct 11:03
Rahul → Called
Result: Interested
Action: Quote sent

08 Oct 16:20
Amit → Updated
Action: Order placed
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
