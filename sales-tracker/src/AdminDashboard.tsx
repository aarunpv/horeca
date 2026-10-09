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

  const [zoneFilter, setZoneFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, DuplicateChoice>>({});
  const [dashboardError, setDashboardError] = useState<string | null>(null);

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

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone_raw.includes(searchQuery) ||
        c.zone.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (zoneFilter !== "All" && c.zone !== zoneFilter) return false;
      if (statusFilter !== "All" && c.current_status !== statusFilter) return false;

      return true;
    });
  }, [contacts, zoneFilter, statusFilter, searchQuery]);

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
      await bulkAssignContacts(Array.from(selectedContactIds), selectedStaffId);
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
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
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

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Total Leads</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{stats.totalContacts}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Calls Today</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{stats.totalCallsToday}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Interested</span>
              <p className="text-xl font-bold text-blue-600 mt-1">{stats.interested}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Maybe</span>
              <p className="text-xl font-bold text-amber-600 mt-1">{stats.maybe}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Orders</span>
              <p className="text-xl font-bold text-purple-600 mt-1">{stats.orders}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Unassigned</span>
              <p className="text-xl font-bold text-rose-600 mt-1">{stats.unassigned}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Overdue</span>
              <p className="text-xl font-bold text-orange-600 mt-1">{stats.overdueFollowUps}</p>
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="search"
              placeholder="Search by name, phone, or zone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white"
            />
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="text-xs p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none"
            >
              {zones.map((z) => (
                <option key={z} value={z}>Zone: {z}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none"
            >
              <option value="All">Status: All</option>
              <option value="Not Contacted">Not Contacted</option>
              <option value="Interested">Interested</option>
              <option value="Maybe">Maybe</option>
              <option value="No Answer">No Answer</option>
              <option value="Not Interested">Not Interested</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
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

          <div className="overflow-x-auto">
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
        </div>
      </main>

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
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg flex-1 sm:w-48 outline-none"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>Assign to: {s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAssignSelected}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm whitespace-nowrap"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};