import { supabase } from "./supabaseClient";
import { NormalizedContact } from "./csvParser";
import { normalizeCallActionItem } from "./callOptions";

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

export interface AdminStats {
  totalContacts: number;
  totalCallsToday: number;
  interested: number;
  notInterested: number;
  wrongNumber: number;
  noAnswerCallback: number;
  orders: number;
  unassigned: number;
  overdueFollowUps: number;
}

export interface ImportDuplicateGroup {
  phone: string;
  contacts: NormalizedContact[];
  existsInDb: boolean;
}

function getSupabaseClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getAdminMetrics(): Promise<AdminStats> {
  const client = getSupabaseClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [contactsRes, callsRes] = await Promise.all([
    client.from("contacts").select("id, current_status, assigned_to, next_follow_up_at"),
    client.from("calls").select("id, status, action, called_at").gte("called_at", todayStart.toISOString()),
  ]);
  if (contactsRes.error) throw contactsRes.error;
  if (callsRes.error) throw callsRes.error;

  const contacts = contactsRes.data || [];
  const calls = callsRes.data || [];
  const now = new Date();

  return {
    totalContacts: contacts.length,
    totalCallsToday: calls.length,
    interested: contacts.filter((c) => normalizeCallActionItem(c.current_status) === "Interested").length,
    notInterested: contacts.filter((c) => normalizeCallActionItem(c.current_status) === "Not Interested").length,
    wrongNumber: contacts.filter((c) => normalizeCallActionItem(c.current_status) === "Wrong Number").length,
    noAnswerCallback: contacts.filter((c) => normalizeCallActionItem(c.current_status) === "No Answer / Callback").length,
    orders: calls.filter((c) => c.action === "Order Placed").length,
    unassigned: contacts.filter((c) => !c.assigned_to).length,
    overdueFollowUps: contacts.filter(
      (c) => c.next_follow_up_at && new Date(c.next_follow_up_at) < now && c.current_status !== "Not Interested"
    ).length,
  };
}

export async function getStaffList(): Promise<StaffMember[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("role", "staff")
    .eq("is_active", true);

  if (error) throw error;
  return data || [];
}

export async function findDbDuplicates(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("contacts")
    .select("phone_normalized")
    .in("phone_normalized", phones);

  if (error) throw error;
  return new Set((data || []).map((row) => row.phone_normalized));
}

export async function insertContactsBatch(contacts: NormalizedContact[]) {
  const client = getSupabaseClient();
  const payload = contacts.map((c) => ({
    name: c.name,
    category: c.category,
    zone: c.zone,
    address: c.address,
    google_rating: c.google_rating,
    google_reviews: c.google_reviews,
    phone_raw: c.phone_raw,
    phone_normalized: c.phone_normalized,
  }));

  const { data, error } = await client.from("contacts").insert(payload);
  if (error) throw error;
  return data;
}

export async function bulkAssignContacts(contactIds: string[], staffId: string | null) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("contacts")
    .update({ assigned_to: staffId, updated_at: new Date().toISOString() })
    .in("id", contactIds);

  if (error) throw error;
  return data;
}