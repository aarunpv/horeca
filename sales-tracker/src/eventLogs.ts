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

export async function writeEventLogs(events: EventLogInput[]): Promise<void> {
  if (events.length === 0) return;
  if (!supabase) throw new Error("Supabase is not configured.");

  for (let offset = 0; offset < events.length; offset += 100) {
    const { error } = await supabase.from("event_logs").insert(events.slice(offset, offset + 100));
    if (error) throw error;
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
  if (error) throw error;

  const logs = (data || []) as EventLog[];
  return { logs, hasMore: logs.length === pageSize };
}
