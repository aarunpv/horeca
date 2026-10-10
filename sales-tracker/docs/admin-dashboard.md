# Admin dashboard: staff activity and reports

## Staff activity

The admin dashboard has one **Staff Activity** card. Select it to open the staff activity screen, which shows one card per active staff member. Each individual card summarizes the number of leads currently assigned to that person and how many of those leads have a status other than **Not Contacted**. Select a staff card to open that person's full-screen activity report.

The detailed report includes:

- Current lead assignments, including category, zone, phone, current status, and next follow-up.
- Counts by current assigned-lead status.
- All-time call record counts by outcome and action.
- Call history with contact, date, outcome, action, and notes.

Calls remain attributed to the staff member who logged them. The assignment list reflects current assignments; reassigning a lead removes it from the previous staff member's current assignment list but does not remove the prior call history.

## Assignment alerts

The admin dashboard displays **New staff assignments may be needed** when an active staff member has no current assignments or has no assigned contacts left with **Not Contacted** status. The alert lists each staff member and their current assignment/remaining untouched counts, and links to the staff activity screen. Leads with other statuses, including scheduled callbacks, are not counted as untouched leads.

## Logs, audit, and reports

- Select **Logs & Audit** in the admin dashboard header to open persistent application logs. Filter by **All logs**, **Errors**, **Audit**, or **Activity**, refresh, load older entries, and download the currently loaded entries as CSV.
- Import validation/parser errors retain the original CSV values; duplicate decisions retain each source row, normalized phone, and whether it was imported or skipped. Import completion/failure, sign-in/sign-out, and opening a staff report are recorded as audit events. Contact assignment changes and staff call outcomes are recorded as activity events.
- Event logs are admin-readable and append-only in the app. They remain in Supabase across browser sessions; only the application database owner can remove them. Deploy the `event_logs` migration using the GitHub Actions Supabase workflow before using the log viewer.
- For duplicate numbers, the default keeps the existing database record (if one exists), otherwise keeps the first CSV row and skips other rows with that number. This does not merge fields into an existing database row. The duplicate log makes each decision and each skipped value visible.
- The **Download CSV** and **Download PDF** controls above the contact filters export only leads matching the current search, category, zone, status, and assignee filters.
- The controls inside a staff activity view export that staff member's current assignments and all-time call history together. The CSV identifies each row as an assignment or a call.
- Reports are generated in the browser. The CSV can be opened in spreadsheet software; the PDF is a downloadable landscape summary.

Reports contain business contact information and call notes. Store and share downloaded files according to your organization's data-handling practices.

## Appearance

Use the app's theme toggle to switch between light mode and the dark appearance, which uses navy app surfaces. Dashboard metric, staff, lead, and activity cards fill the available display width and alternate muted blue, indigo, and gray shades. Square corners and consistent borders keep the list structure clear in both themes. The selected theme is remembered by the browser.

Call action items are **Interested**, **Not Interested**, **Wrong Number**, and **No Answer / Callback**. Outcomes are **Quote Sent**, **Followup Required**, **Order Placed**, **Meeting Requested**, **Try Again Later**, and **Callback Requested**. The activity calendar filters action items and outcomes separately. Orders are counted from the **Order Placed** outcome, not as a call action item.

## Activity calendar

Expand **Activity calendar** on the admin or staff dashboard to review logged calls and scheduled follow-ups. Select **Today**, a specific **Date**, or a **Date range**. Admins can also select a staff member or **All staff**. The **Filter by metric** options include all activity, calls, scheduled follow-ups, any of the four action items, or any of the six outcomes. A call appears at its recorded call time; if it has a scheduled follow-up, that appears as a separate event at the saved follow-up date/time. Staff calendars are scoped to the signed-in staff member and show the metric filter without the staff selector.

## Dashboard lists and collapsible groups

Dashboard card collections use a single-column list on all screen sizes. Select a section heading (for example **Dashboard metrics**, **Leads**, or **Current assignments**) to collapse or expand that group; groups start expanded.
