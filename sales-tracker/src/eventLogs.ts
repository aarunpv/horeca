import { supabase } from "./supabaseClient";

export type EventLogCategory = "error" | "audit" | "activity";
export type EventLogFilter = "all" | EventLogCategory;

export interface EventLogInput {
  event_category: EventLogCategory;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EventLog extends EventLogInput {
  id: string;
  actor_id: string | null;
  created_at: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const databaseError = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const code = typeof databaseError.code === "string" ? ` (${databaseError.code})` : "";
    const message =
      typeof databaseError.message === "string" ? databaseError.message : "Unknown database error.";
    const details =
      typeof databaseError.details === "string" && databaseError.details
        ? ` Details: ${databaseError.details}`
        : "";
    const hint =
      typeof databaseError.hint === "string" && databaseError.hint
        ? ` Hint: ${databaseError.hint}`
        : "";

    if (databaseError.code === "PGRST205" || databaseError.code === "42P01") {
      return `The event_logs table is not available. Deploy the Supabase event-log migration through GitHub Actions.${code} ${message}${hint}`;
    }
    return `${message}${code}${details}${hint}`;
  }
  return "Unknown event logging error.";
}

export async function writeEventLogs(events: EventLogInput[]): Promise<void> {
  if (events.length === 0) return;
  if (!supabase) throw new Error("Supabase is not configured.");

  for (let offset = 0; offset < events.length; offset += 100) {
    const { error } = await supabase.from("event_logs").insert(events.slice(offset, offset + 100));
    if (error) throw new Error(getErrorMessage(error));
  }
}

export async function loadEventLogs(
  filter: EventLogFilter,
  offset: number,
  pageSize = 100
): Promise<{ logs: EventLog[]; hasMore: boolean }> {
  if (!supabase) throw new Error("Supabase is not configured.");

  let query = supabase
    .from("event_logs")
    .select("id, actor_id, event_category, action, message, details, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filter !== "all") query = query.eq("event_category", filter);
  const { data, error } = await query;
  if (error) throw new Error(getErrorMessage(error));

  const logs = (data || []) as EventLog[];
  return { logs, hasMore: logs.length === pageSize };
}
