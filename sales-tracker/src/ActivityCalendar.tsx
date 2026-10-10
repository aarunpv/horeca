import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import type { ContactItem } from "./StaffCallingDashboard";
import { CALL_ACTION_ITEMS, CALL_OUTCOMES, normalizeCallActionItem, normalizeCallOutcome } from "./callOptions";

interface ActivityCalendarProps {
  contacts: ContactItem[];
  staffId?: string;
  staffOptions?: { id: string; name: string }[];
}

interface ActivityCall {
  id: string;
  contact_id: string;
  user_id: string | null;
  status: string;
  action: string | null;
  notes: string | null;
  called_at: string;
  follow_up_date: string | null;
}

interface ActivityEvent {
  id: string;
  type: "Call" | "Scheduled follow-up";
  at: string;
  call: ActivityCall;
}

type DateMode = "today" | "date" | "range";

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateBounds = (dateValue: string): [string, string] | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  const start = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(start.getTime()) || formatLocalDate(start) !== dateValue) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
};

const loadCallsForField = async (
  field: "called_at" | "follow_up_date",
  start: string,
  end: string,
  staffId?: string
): Promise<ActivityCall[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const pageSize = 1000;
  const rows: ActivityCall[] = [];

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("calls")
      .select("id, contact_id, user_id, status, action, notes, called_at, follow_up_date")
      .gte(field, start)
      .lt(field, end)
      .order(field, { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (staffId) query = query.eq("user_id", staffId);

    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as ActivityCall[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

const loadActivityCalls = async (
  start: string,
  end: string,
  staffId?: string
): Promise<ActivityCall[]> => {
  const [calls, scheduled] = await Promise.all([
    loadCallsForField("called_at", start, end, staffId),
    loadCallsForField("follow_up_date", start, end, staffId),
  ]);
  return Array.from(new Map([...calls, ...scheduled].map((call) => [call.id, call])).values());
};

export const ActivityCalendar: React.FC<ActivityCalendarProps> = ({ contacts, staffId, staffOptions }) => {
  const today = formatLocalDate(new Date());
  const [mode, setMode] = useState<DateMode>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [calls, setCalls] = useState<ActivityCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("All");
  const [selectedMetric, setSelectedMetric] = useState("All");

  const dateBounds = useMemo((): [string, string] | null => {
    if (mode === "range") {
      if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return null;
      const startBounds = getDateBounds(rangeStart);
      const endBounds = getDateBounds(rangeEnd);
      if (!startBounds || !endBounds) return null;
      return [startBounds[0], endBounds[1]];
    }
    return getDateBounds(mode === "today" ? today : selectedDate);
  }, [mode, rangeStart, rangeEnd, selectedDate, today]);

  useEffect(() => {
    if (!dateBounds) {
      setCalls([]);
      setError("Choose a valid date range. The start date must not be after the end date.");
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);
    const filterStaffId = staffId || (selectedStaffId === "All" ? undefined : selectedStaffId);
    void loadActivityCalls(dateBounds[0], dateBounds[1], filterStaffId)
      .then((results) => {
        if (isCurrent) setCalls(results);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setCalls([]);
          setError(loadError instanceof Error ? loadError.message : "Could not load calendar activity.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [dateBounds, staffId, selectedStaffId]);

  const events = useMemo(() => {
    const allEvents: ActivityEvent[] = calls.flatMap((call) => {
      const callEvent: ActivityEvent = {
        id: `${call.id}-call`,
        type: "Call",
        at: call.called_at,
        call,
      };
      if (!call.follow_up_date) return [callEvent];
      return [
        callEvent,
        {
          id: `${call.id}-follow-up`,
          type: "Scheduled follow-up",
          at: call.follow_up_date,
          call,
        },
      ];
    });

    return allEvents
      .filter((event) => {
        if (!dateBounds) return false;
        const eventTime = new Date(event.at).getTime();
        return eventTime >= new Date(dateBounds[0]).getTime() && eventTime < new Date(dateBounds[1]).getTime();
      })
      .filter((event) => {
        if (selectedMetric === "All") return true;
        if (selectedMetric === "Calls") return event.type === "Call";
        if (selectedMetric === "Scheduled follow-ups") return event.type === "Scheduled follow-up";
        if (selectedMetric.startsWith("Action: ")) {
          return normalizeCallActionItem(event.call.status) === selectedMetric.slice("Action: ".length);
        }
        if (selectedMetric.startsWith("Outcome: ")) {
          return normalizeCallOutcome(event.call.action) === selectedMetric.slice("Outcome: ".length);
        }
        return false;
      })
      .sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime());
  }, [calls, selectedMetric, dateBounds]);

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const heading = mode === "today"
    ? `Today · ${new Date(`${today}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "long" })}`
    : mode === "date"
      ? selectedDate
        ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "long" })
        : "Select a date"
      : `${rangeStart || "Start"} – ${rangeEnd || "End"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Activity date range">
        {([
          ["today", "Today"],
          ["date", "Date"],
          ["range", "Date range"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold ${
              mode === key
                ? "border-emerald-800 bg-emerald-800 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "date" && (
        <label className="block max-w-sm text-xs font-semibold text-gray-700">
          Select date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      )}

      {mode === "range" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700">
            Start date
            <input
              type="date"
              value={rangeStart}
              max={rangeEnd || undefined}
              onChange={(event) => setRangeStart(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            End date
            <input
              type="date"
              value={rangeEnd}
              min={rangeStart || undefined}
              onChange={(event) => setRangeEnd(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 ${staffOptions ? "sm:grid-cols-2" : ""}`}>
        {staffOptions && (
          <label className="text-xs font-semibold text-gray-700">
            Filter by staff
            <select
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="All">All staff</option>
              {staffOptions.map((staff) => (
                <option key={staff.id} value={staff.id}>{staff.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-semibold text-gray-700">
          Filter by metric
          <select
            value={selectedMetric}
            onChange={(event) => setSelectedMetric(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="All">All activity</option>
            <option value="Calls">Calls</option>
            <option value="Scheduled follow-ups">Scheduled follow-ups</option>
            <optgroup label="Call action">
              {CALL_ACTION_ITEMS.map((actionItem) => (
                <option key={`action-${actionItem}`} value={`Action: ${actionItem}`}>{actionItem}</option>
              ))}
            </optgroup>
            <optgroup label="Outcome">
              {CALL_OUTCOMES.map((outcome) => (
                <option key={`outcome-${outcome}`} value={`Outcome: ${outcome}`}>{outcome}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <section aria-label="Activity calendar results" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">{heading}</h3>
          <span className="text-xs text-gray-500">{events.length} activities</span>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading activity...</p>
        ) : events.length === 0 && !error ? (
          <p className="rounded-xl border border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">
            No activity matches this date and the selected filters.
          </p>
        ) : (
          <div className="crm-colorful-list space-y-2">
            {events.map((event) => {
              const contact = contactById.get(event.call.contact_id);
              return (
                <article key={event.id} className="crm-color-card flex min-w-0 flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        event.type === "Call" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"
                      }`}>
                        {event.type}
                      </span>
                      <span className="text-xs font-semibold text-gray-900">
                        Action: {normalizeCallActionItem(event.call.status)}
                      </span>
                      {event.call.action && (
                        <span className="text-xs text-purple-700">
                          Outcome: {normalizeCallOutcome(event.call.action)}
                        </span>
                      )}
                    </div>
                    <h4 className="mt-1 break-words text-sm font-bold text-gray-900">
                      {contact?.name || "Contact no longer available"}
                    </h4>
                    {contact && <p className="mt-0.5 text-xs text-gray-500">{contact.category} · {contact.zone} · {contact.phone_raw}</p>}
                    {event.call.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-gray-600">{event.call.notes}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-gray-500">
                    {new Date(event.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
