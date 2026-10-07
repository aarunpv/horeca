import React, { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import {
  getAdminMetrics,
  getStaffList,
  findDbDuplicates,
  insertContactsBatch,
  bulkAssignContacts,
  AdminStats,
  StaffMember,
} from "./adminService";
import { processCsvBatch, NormalizedContact, RawCsvRow } from "./csvParser";
import { ContactItem } from "./StaffCallingDashboard";
import { supabase } from "./supabaseClient";

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

  const loadData = async () => {
    if (!supabase) return;

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
    } catch (err: any) {
      console.error("Dashboard load failed:", err.message);
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
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
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
          const phoneList = validContacts.map((c) => c.phone_normalized);
          const dbDuplicates = await findDbDuplicates(phoneList);

          const readyToInsert: NormalizedContact[] = [];
          const existingMatches: NormalizedContact[] = [];

          validContacts.forEach((contact) => {
            if (dbDuplicates.has(contact.phone_normalized)) {
              existingMatches.push(contact);
            } else {
              readyToInsert.push(contact);
            }
          });

          if (readyToInsert.length > 0) {
            await insertContactsBatch(readyToInsert);
          }

          setUploadFeedback(
            `Import complete: ${readyToInsert.length} added. (${existingMatches.length} existing skipped, ${inFileDataDuplicates.length} duplicates skipped, ${invalidRows.length} invalid).`
          );
          await loadData();
        } catch (err: any) {
          setUploadFeedback(`Import failed: ${err.message}`);
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
                    const assignedStaffMember = staff.find((s) => s.id === (contact as any).assigned_to);

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