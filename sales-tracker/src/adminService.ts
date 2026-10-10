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

interface ContactMetric {
  current_status: string;
  assigned_to: string | null;
  next_follow_up_at: string | null;
}

export async function getAdminMetrics(
  contactsPromise: Promise<ContactMetric[]>
): Promise<AdminStats> {
  const client = getSupabaseClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [contacts, callsTodayRes, ordersRes] = await Promise.all([
    contactsPromise,
    client
      .from("calls")
      .select("id", { count: "exact", head: true })
      .gte("called_at", todayStart.toISOString()),
    client
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("status", "Order Placed"),
  ]);
  if (callsTodayRes.error) throw callsTodayRes.error;
  if (ordersRes.error) throw ordersRes.error;
  const now = new Date();
  const contactStats = contacts.reduce(
    (stats, contact) => {
      const status = normalizeCallActionItem(contact.current_status);
      if (status === "Interested") stats.interested += 1;
      if (status === "Not Interested") stats.notInterested += 1;
      if (status === "Wrong Number") stats.wrongNumber += 1;
      if (status === "No Answer / Callback") stats.noAnswerCallback += 1;
      if (!contact.assigned_to) stats.unassigned += 1;
      if (
        contact.next_follow_up_at &&
        new Date(contact.next_follow_up_at) < now &&
        status !== "Not Interested"
      ) {
        stats.overdueFollowUps += 1;
      }
      return stats;
    },
    {
      interested: 0,
      notInterested: 0,
      wrongNumber: 0,
      noAnswerCallback: 0,
      unassigned: 0,
      overdueFollowUps: 0,
    }
  );

  return {
    totalContacts: contacts.length,
    totalCallsToday: callsTodayRes.count || 0,
    ...contactStats,
    orders: ordersRes.count || 0,
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