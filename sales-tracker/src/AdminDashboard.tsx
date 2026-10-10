import React, { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import {
  getAdminMetrics,
  getStaffList,
  findDbDuplicates,
  insertContactsBatch,
  bulkAssignContacts,
  type AdminStats,
  type StaffMember,
} from "./adminService";
import { processCsvBatch, type NormalizedContact, type RawCsvRow } from "./csvParser";
import type { ContactItem } from "./StaffCallingDashboard";
import { supabase } from "./supabaseClient";
import type { ImportDuplicateGroup } from "./adminService";

type DuplicateChoice = "merge" | "keep" | "ignore";
type MetricKey = "leads" | "callsToday" | "interested" | "maybe" | "orders" | "unassigned" | "overdue";
type MetricCall = {
  id: string;
  contact_id: string;
  user_id: string | null;
  status: string;
  action: string | null;
  notes: string | null;
  called_at: string;
};
type PendingImport = {
  uniqueContacts: NormalizedContact[];
  duplicateGroups: ImportDuplicateGroup[];
  invalidCount: number;
};

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");

  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [zoneFilter, setZoneFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [assignedFilter, setAssignedFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, DuplicateChoice>>({});
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [metricCalls, setMetricCalls] = useState<MetricCall[]>([]);
  const [isMetricLoading, setIsMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState<string | null>(null);

  const loadData = async () => {
    if (!supabase) return;

    setDashboardError(null);
    try {
      const [statsData, staffData, contactsRes] = await Promise.all([
        getAdminMetrics(),
        getStaffList(),
        supabase.from("contacts").select("*").order("created_at", { ascending: false }),
      ]);
      if (contactsRes.error) throw contactsRes.error;
      setStats(statsData);
      setStaff(staffData);
      setContacts(contactsRes.data || []);
      if (staffData.length > 0 && !selectedStaffId) setSelectedStaffId(staffData[0].id);
    } catch (err: unknown) {
      setDashboardError(err instanceof Error ? err.message : "Dashboard data could not be loaded.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const zones = useMemo(() => {
    const list = Array.from(new Set(contacts.map((c) => c.zone).filter(Boolean)));
    return ["All", ...list];
  }, [contacts]);

  const categories = useMemo(() => {
    const list = Array.from(new Set(contacts.map((c) => c.category).filter(Boolean)));
    return ["All", ...list];
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone_raw.includes(searchQuery) ||
        c.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.category.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (categoryFilter !== "All" && c.category !== categoryFilter) return false;
      if (zoneFilter !== "All" && c.zone !== zoneFilter) return false;
      if (statusFilter !== "All" && c.current_status !== statusFilter) return false;
      if (assignedFilter === "Unassigned" && c.assigned_to) return false;
      if (assignedFilter !== "All" && assignedFilter !== "Unassigned" && c.assigned_to !== assignedFilter) {
        return false;
      }

      return true;
    });
  }, [contacts, categoryFilter, zoneFilter, statusFilter, assignedFilter, searchQuery]);

  const metricContacts = useMemo(() => {
    if (!selectedMetric) return [];
    return contacts.filter((contact) => {
      if (selectedMetric === "leads") return true;
      if (selectedMetric === "interested") return contact.current_status === "Interested";
      if (selectedMetric === "maybe") return contact.current_status === "Maybe";
      if (selectedMetric === "unassigned") return !contact.assigned_to;
      if (selectedMetric === "overdue") {
        return Boolean(
          contact.next_follow_up_at &&
          new Date(contact.next_follow_up_at) < new Date() &&
          contact.current_status !== "Not Interested"
        );
      }
      return false;
    });
  }, [contacts, selectedMetric]);

  const openMetricDetails = async (metric: MetricKey) => {
    setSelectedMetric(metric);
    setMetricCalls([]);
    setMetricError(null);

    if (metric !== "callsToday" && metric !== "orders") return;
    if (!supabase) {
      setMetricError("Supabase is not configured.");
      return;
    }

    setIsMetricLoading(true);
    try {
      let query = supabase
        .from("calls")
        .select("id, contact_id, user_id, status, action, notes, called_at")
        .order("called_at", { ascending: false });

      if (metric === "callsToday") {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        query = query.gte("called_at", startOfToday.toISOString());
      } else {
        query = query.eq("action", "Order Placed");
      }

      const { data, error } = await query;
      if (error) throw error;
      setMetricCalls((data || []) as MetricCall[]);
    } catch (error: unknown) {
      setMetricError(error instanceof Error ? error.message : "Could not load metric details.");
    } finally {
      setIsMetricLoading(false);
    }
  };

  const metricTitle: Record<MetricKey, string> = {
    leads: "All Leads",
    callsToday: "Calls Today",
    interested: "Interested Leads",
    maybe: "Maybe Leads",
    orders: "Orders",
    unassigned: "Unassigned Leads",
    overdue: "Overdue Follow-ups",
  };

  const metricCards: { key: MetricKey; label: string; value: number; valueClass: string }[] = stats
    ? [
        { key: "leads", label: "Total Leads", value: stats.totalContacts, valueClass: "text-gray-900" },
        { key: "callsToday", label: "Calls Today", value: stats.totalCallsToday, valueClass: "text-emerald-600" },
        { key: "interested", label: "Interested", value: stats.interested, valueClass: "text-blue-600" },
        { key: "maybe", label: "Maybe", value: stats.maybe, valueClass: "text-amber-600" },
        { key: "orders", label: "Orders", value: stats.orders, valueClass: "text-purple-600" },
        { key: "unassigned", label: "Unassigned", value: stats.unassigned, valueClass: "text-rose-600" },
        { key: "overdue", label: "Overdue", value: stats.overdueFollowUps, valueClass: "text-orange-600" },
      ]
    : [];

  const handleToggleSelect = (id: string) => {
    const updated = new Set(selectedContactIds);
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    setSelectedContactIds(updated);
  };

  const handleSelectAllFiltered = () => {
    const allFilteredSelected =
      filteredContacts.length > 0 && filteredContacts.every((contact) => selectedContactIds.has(contact.id));

    setSelectedContactIds((current) => {
      const updated = new Set(current);
      filteredContacts.forEach((contact) => {
        if (allFilteredSelected) updated.delete(contact.id);
        else updated.add(contact.id);
      });
      return updated;
    });
  };

  const handleAssignSelected = async () => {
    if (!selectedStaffId || selectedContactIds.size === 0) return;
    try {
      await bulkAssignContacts(
        Array.from(selectedContactIds),
        selectedStaffId === "__unassign__" ? null : selectedStaffId
      );
      setSelectedContactIds(new Set());
      await loadData();
    } catch (err: unknown) {
      setDashboardError(err instanceof Error ? err.message : "Assignment failed.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadFeedback("Parsing CSV...");

    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { validContacts, inFileDataDuplicates, invalidRows } = processCsvBatch(results.data);
          const allContacts = [...validContacts, ...inFileDataDuplicates];
          const contactsByPhone = new Map<string, NormalizedContact[]>();
          allContacts.forEach((contact) => {
            const group = contactsByPhone.get(contact.phone_normalized) || [];
            group.push(contact);
            contactsByPhone.set(contact.phone_normalized, group);
          });
          const phoneList = Array.from(contactsByPhone.keys());
          const dbDuplicates = await findDbDuplicates(phoneList);

          const duplicateGroups: ImportDuplicateGroup[] = [];
          const uniqueContacts: NormalizedContact[] = [];
          contactsByPhone.forEach((contacts, phone) => {
            const existsInDb = dbDuplicates.has(phone);
            if (contacts.length > 1 || existsInDb) {
              duplicateGroups.push({ phone, contacts, existsInDb });
            } else {
              uniqueContacts.push(contacts[0]);
            }
          });

          if (duplicateGroups.length > 0) {
            setPendingImport({ uniqueContacts, duplicateGroups, invalidCount: invalidRows.length });
            setDuplicateChoices(
              Object.fromEntries(duplicateGroups.map(({ phone }) => [phone, "merge" as DuplicateChoice]))
            );
          } else {
            if (uniqueContacts.length > 0) await insertContactsBatch(uniqueContacts);
            setUploadFeedback(`Import complete: ${uniqueContacts.length} added, ${invalidRows.length} invalid.`);
            await loadData();
          }
        } catch (err: unknown) {
          setUploadFeedback(`Import failed: ${err instanceof Error ? err.message : "Unknown error."}`);
        } finally {
          setIsUploading(false);
          e.target.value = "";
        }
      },
      error: (err) => {
        setUploadFeedback(`Parsing failed: ${err.message}`);
        setIsUploading(false);
      },
    });
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    setIsUploading(true);
    try {
      const selectedDuplicates = pendingImport.duplicateGroups.flatMap((group) => {
        const choice = duplicateChoices[group.phone] || "merge";
        if (choice === "ignore" || (choice === "merge" && group.existsInDb)) return [];
        return choice === "keep" ? group.contacts : group.contacts.slice(0, 1);
      });
      const contactsToInsert = [...pendingImport.uniqueContacts, ...selectedDuplicates];
      if (contactsToInsert.length > 0) await insertContactsBatch(contactsToInsert);
      setUploadFeedback(
        `Import complete: ${contactsToInsert.length} added, ${pendingImport.invalidCount} invalid.`
      );
      setPendingImport(null);
      setDuplicateChoices({});
      await loadData();
    } catch (err: unknown) {
      setUploadFeedback(`Import failed: ${err instanceof Error ? err.message : "Unknown error."}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-gray-50 pb-28">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-0 sm:flex-row sm:items-center sm:px-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin Command Center</h1>
            <p className="text-xs text-gray-500">Lead Ingestion & Territory Distribution</p>
          </div>

          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition">
            <span>{isUploading ? "Uploading..." : "Upload CSV"}</span>
            <input type="file" accept=".csv" className="hidden" disabled={isUploading} onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-3 py-4 sm:px-5 md:py-6">
        {dashboardError && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl">
            {dashboardError}
          </div>
        )}

        {uploadFeedback && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl flex justify-between items-center">
            <span>{uploadFeedback}</span>
            <button onClick={() => setUploadFeedback(null)} className="text-blue-500 font-bold ml-4">✕</button>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-7">
            {metricCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => void openMetricDetails(card.key)}
                aria-label={`View ${card.label.toLowerCase()} details`}
                className="min-h-24 min-w-0 touch-manipulation rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 active:scale-[0.98]"
              >
                <span className="block text-[10px] font-bold uppercase leading-tight text-gray-500">{card.label}</span>
                <p className={`mt-1 text-xl font-bold ${card.valueClass}`}>{card.value}</p>
                <span className="mt-1 block text-[10px] font-semibold text-emerald-800">Tap for details →</span>
              </button>
            ))}
          </div>
        )}

        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input
              type="search"
              placeholder="Search name, phone, category, or zone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white lg:col-span-2"
              aria-label="Search contacts"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs outline-none"
              aria-label="Filter by category"
            >
              {categories.map((category) => (
                <option key={category} value={category}>Category: {category}</option>
              ))}
            </select>
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs outline-none"
              aria-label="Filter by zone"
            >
              {zones.map((z) => (
                <option key={z} value={z}>Zone: {z}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs outline-none"
              aria-label="Filter by status"
            >
              <option value="All">Status: All</option>
              <option value="Not Contacted">Not Contacted</option>
              <option value="Interested">Interested</option>
              <option value="Maybe">Maybe</option>
              <option value="No Answer / Callback">No Answer / Callback</option>
              <option value="No Answer">No Answer</option>
              <option value="Not Interested">Not Interested</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Order Placed">Order Placed</option>
            </select>
            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs outline-none"
              aria-label="Filter by assigned staff member"
            >
              <option value="All">Assigned: All</option>
              <option value="Unassigned">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>Assigned: {member.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-3 text-xs text-gray-500">
            <label className="flex min-h-11 items-center gap-2 py-1 font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={filteredContacts.length > 0 && filteredContacts.every((contact) => selectedContactIds.has(contact.id))}
                onChange={handleSelectAllFiltered}
                className="rounded border-gray-300 text-emerald-600"
              />
              Select All Filtered ({filteredContacts.length})
            </label>
            <span>{selectedContactIds.size} Selected</span>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-3 w-8"></th>
                  <th className="p-3">Business</th>
                  <th className="p-3">Zone / Category</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Rating</th>
                  <th className="p-3">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No leads match the filters.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => {
                    const isSelected = selectedContactIds.has(contact.id);
                    const assignedStaffMember = staff.find((s) => s.id === contact.assigned_to);

                    return (
                      <tr
                        key={contact.id}
                        className={`hover:bg-gray-50 transition cursor-pointer ${isSelected ? "bg-emerald-50/40" : ""}`}
                        onClick={() => handleToggleSelect(contact.id)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(contact.id)}
                            className="rounded border-gray-300 text-emerald-600"
                          />
                        </td>
                        <td className="p-3 font-bold text-gray-900">
                          {contact.name}
                          <p className="font-normal text-[11px] text-gray-500 line-clamp-1">{contact.address}</p>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium">
                            {contact.zone}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{contact.phone_raw}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                            {contact.current_status}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {contact.google_rating ? (
                            <span className="text-amber-700 font-semibold">★ {contact.google_rating}</span>
                          ) : "-"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {assignedStaffMember ? (
                            <span className="font-semibold text-gray-800">{assignedStaffMember.name}</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Unassigned</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-3 lg:hidden">
            {filteredContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No leads match the filters.</p>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContactIds.has(contact.id);
                const assignedStaffMember = staff.find((member) => member.id === contact.assigned_to);
                return (
                  <article
                    key={contact.id}
                    className={`min-w-0 rounded-xl border p-3 transition ${
                      isSelected ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(contact.id)}
                        aria-label={`Select ${contact.name}`}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 text-emerald-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="break-words text-sm font-bold text-gray-900">{contact.name}</h3>
                            <a
                              href={`tel:+91${contact.phone_normalized}`}
                              className="mt-1 inline-block min-h-8 py-1 font-mono text-sm font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2"
                            >
                              {contact.phone_raw}
                            </a>
                          </div>
                          {contact.google_rating && (
                            <span className="shrink-0 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                              ★ {contact.google_rating}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 break-words text-xs text-gray-600">
                          {contact.category} · {contact.zone}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">
                            {contact.current_status}
                          </span>
                          <span className={assignedStaffMember ? "text-gray-600" : "font-semibold text-rose-600"}>
                            {assignedStaffMember ? `Assigned: ${assignedStaffMember.name}` : "Unassigned"}
                          </span>
                        </div>
                        {contact.address && (
                          <p className="mt-2 line-clamp-2 break-words text-xs text-gray-500">{contact.address}</p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </main>

      {selectedMetric && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedMetric(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="metric-details-title"
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-gray-200 p-4 sm:p-5">
              <div>
                <h2 id="metric-details-title" className="text-lg font-bold text-gray-900">
                  {metricTitle[selectedMetric]}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedMetric === "callsToday"
                    ? "Call activity recorded today"
                    : selectedMetric === "orders"
                      ? "Call records marked as Order Placed"
                      : `${metricContacts.length} matching ${metricContacts.length === 1 ? "contact" : "contacts"}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMetric(null)}
                aria-label="Close metric details"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                ✕
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              {metricError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {metricError}
                </p>
              )}
              {isMetricLoading ? (
                <p className="py-10 text-center text-sm text-gray-500">Loading details...</p>
              ) : selectedMetric === "callsToday" || selectedMetric === "orders" ? (
                metricCalls.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500">No call records found.</p>
                ) : (
                  <div className="space-y-3">
                    {metricCalls.map((call) => {
                      const contact = contacts.find((item) => item.id === call.contact_id);
                      const caller = staff.find((member) => member.id === call.user_id);
                      return (
                        <article key={call.id} className="rounded-xl border border-gray-200 p-3 sm:p-4">
                          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                {contact?.name || "Contact no longer available"}
                              </h3>
                              {contact && (
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {contact.phone_raw} · {contact.category} · {contact.zone}
                                </p>
                              )}
                            </div>
                            <time className="text-xs text-gray-500">
                              {new Date(call.called_at).toLocaleString("en-IN", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </time>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">
                              {call.status}
                            </span>
                            {call.action && (
                              <span className="rounded-full bg-purple-50 px-2.5 py-1 font-semibold text-purple-700">
                                {call.action}
                              </span>
                            )}
                            {caller && <span className="px-1 py-1 text-gray-500">By {caller.name}</span>}
                          </div>
                          {call.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{call.notes}</p>}
                        </article>
                      );
                    })}
                  </div>
                )
              ) : metricContacts.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">No matching contacts found.</p>
              ) : (
                <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Contact</th>
                        <th className="px-3 py-2">Category / Zone</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Assigned to</th>
                        <th className="px-3 py-2">Follow-up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {metricContacts.map((contact) => {
                        const assignedMember = staff.find((member) => member.id === contact.assigned_to);
                        return (
                          <tr key={contact.id}>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-gray-900">{contact.name}</p>
                              <p className="text-xs text-gray-500">{contact.phone_raw}</p>
                            </td>
                            <td className="px-3 py-3 text-gray-700">
                              {contact.category} · {contact.zone}
                            </td>
                            <td className="px-3 py-3 text-gray-700">{contact.current_status}</td>
                            <td className="px-3 py-3 text-gray-700">{assignedMember?.name || "Unassigned"}</td>
                            <td className="px-3 py-3 text-gray-700">
                              {contact.next_follow_up_at
                                ? new Date(contact.next_follow_up_at).toLocaleString("en-IN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 lg:hidden">
                  {metricContacts.map((contact) => {
                    const assignedMember = staff.find((member) => member.id === contact.assigned_to);
                    return (
                      <article key={contact.id} className="min-w-0 rounded-xl border border-gray-200 p-3">
                        <h3 className="break-words text-sm font-semibold text-gray-900">{contact.name}</h3>
                        <a
                          href={`tel:+91${contact.phone_normalized}`}
                          className="mt-1 inline-block min-h-8 py-1 font-mono text-sm text-emerald-800 underline underline-offset-2"
                        >
                          {contact.phone_raw}
                        </a>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                          <div className="min-w-0">
                            <dt className="text-gray-500">Category / Zone</dt>
                            <dd className="break-words font-medium text-gray-800">{contact.category} · {contact.zone}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500">Status</dt>
                            <dd className="break-words font-medium text-gray-800">{contact.current_status}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500">Assigned to</dt>
                            <dd className="break-words font-medium text-gray-800">{assignedMember?.name || "Unassigned"}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500">Follow-up</dt>
                            <dd className="break-words font-medium text-gray-800">
                              {contact.next_follow_up_at
                                ? new Date(contact.next_follow_up_at).toLocaleString("en-IN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-import-title"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="duplicate-import-title" className="text-lg font-bold text-gray-900">
                  Review duplicate phone numbers
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Choose how to handle each matching number. Merge keeps one record; Keep both imports every CSV row.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                aria-label="Cancel import"
                className="text-gray-500 hover:text-gray-900"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {pendingImport.duplicateGroups.map((group) => (
                <div key={group.phone} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-gray-900">{group.phone}</p>
                    <p className="text-xs text-gray-600">{group.contacts.map((contact) => contact.name).join(", ")}</p>
                    {group.existsInDb && (
                      <p className="mt-1 text-xs font-semibold text-amber-700">This phone number already exists in the database.</p>
                    )}
                  </div>
                  <select
                    aria-label={`Duplicate action for ${group.phone}`}
                    value={duplicateChoices[group.phone] || "merge"}
                    onChange={(event) =>
                      setDuplicateChoices((current) => ({
                        ...current,
                        [group.phone]:
                          event.target.value === "keep" || event.target.value === "ignore"
                            ? event.target.value
                            : "merge",
                      }))
                    }
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="merge">Merge / keep one</option>
                    <option value="keep">Keep both</option>
                    <option value="ignore">Ignore this number</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">
                {pendingImport.uniqueContacts.length} unique contacts will be added; {pendingImport.invalidCount} invalid rows will be skipped.
              </p>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isUploading}
                className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {isUploading ? "Importing..." : "Import contacts"}
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedContactIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-300 p-4 shadow-2xl z-40">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs font-bold text-gray-800">
              {selectedContactIds.size} leads selected for allocation
            </span>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-xs outline-none sm:w-48"
                aria-label="Assign or unassign selected contacts"
              >
                <option value="">Choose staff member</option>
                <option value="__unassign__">Unassign selected</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>Assign to: {s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAssignSelected}
                className="min-h-11 w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 sm:w-auto sm:whitespace-nowrap"
              >
                {selectedStaffId === "__unassign__" ? "Confirm Unassignment" : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};