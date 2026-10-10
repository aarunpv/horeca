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
import { downloadCsvReport, downloadPdfReport } from "./reportExports";
import { CollapsibleGroup } from "./CollapsibleGroup";
import { ActivityCalendar } from "./ActivityCalendar";
import { CALL_ACTION_ITEMS, normalizeCallActionItem, normalizeCallOutcome } from "./callOptions";

type DuplicateChoice = "merge" | "keep" | "ignore";
type MetricKey =
  | "leads"
  | "callsToday"
  | "interested"
  | "notInterested"
  | "wrongNumber"
  | "noAnswerCallback"
  | "orders"
  | "unassigned"
  | "overdue";
type MetricCall = {
  id: string;
  contact_id: string;
  user_id: string | null;
  status: string;
  action: string | null;
  notes: string | null;
  called_at: string;
};
type StaffActivityCall = MetricCall;
type PendingImport = {
  uniqueContacts: NormalizedContact[];
  duplicateGroups: ImportDuplicateGroup[];
  headers: string[];
  fileName: string;
};
type DuplicateImportAuditRow = {
  row: RawCsvRow;
  recordNumber: number;
  phone: string;
  resolution: string;
  result: "Imported" | "Skipped";
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
  const [skippedImportRows, setSkippedImportRows] = useState<{
    rows: { row: RawCsvRow; reason: string; recordNumber: number }[];
    headers: string[];
    fileName: string;
  } | null>(null);
  const [duplicateImportLog, setDuplicateImportLog] = useState<{
    rows: DuplicateImportAuditRow[];
    headers: string[];
    fileName: string;
  } | null>(null);
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, DuplicateChoice>>({});
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [metricCalls, setMetricCalls] = useState<MetricCall[]>([]);
  const [isMetricLoading, setIsMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState<string | null>(null);
  const [staffActivityView, setStaffActivityView] = useState<"dashboard" | "staff-list" | "staff-detail">("dashboard");
  const [staffActivityTarget, setStaffActivityTarget] = useState<StaffMember | null>(null);
  const [staffActivityCalls, setStaffActivityCalls] = useState<StaffActivityCall[]>([]);
  const [isStaffActivityLoading, setIsStaffActivityLoading] = useState(false);
  const [staffActivityError, setStaffActivityError] = useState<string | null>(null);

  const loadAllContacts = async (): Promise<ContactItem[]> => {
    if (!supabase) return [];
    const contacts: ContactItem[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, category, zone, address, google_rating, google_reviews, phone_raw, phone_normalized, current_status, next_follow_up_at, assigned_to")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data || []).map((contact) => ({
        ...contact,
        current_status: normalizeCallActionItem(contact.current_status),
      })) as ContactItem[];
      contacts.push(...page);
      if (page.length < pageSize) return contacts;
    }
  };

  const loadData = async () => {
    if (!supabase) return;

    setDashboardError(null);
    try {
      const contactsPromise = loadAllContacts();
      const [statsData, staffData, contactsRes] = await Promise.all([
        getAdminMetrics(contactsPromise),
        getStaffList(),
        contactsPromise,
      ]);
      setStats(statsData);
      setStaff(staffData);
      setContacts(contactsRes);
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

  const contactsByStaff = useMemo(() => {
    const grouped = new Map<string, ContactItem[]>();
    contacts.forEach((contact) => {
      if (!contact.assigned_to) return;
      const assigned = grouped.get(contact.assigned_to) || [];
      assigned.push(contact);
      grouped.set(contact.assigned_to, assigned);
    });
    return grouped;
  }, [contacts]);

  const staffAssignmentAlerts = useMemo(
    () =>
      staff.flatMap((member) => {
        const assignedContacts = contactsByStaff.get(member.id) || [];
        const remainingToCall = assignedContacts.filter(
          (contact) => contact.current_status === "Not Contacted"
        ).length;
        if (assignedContacts.length > 0 && remainingToCall > 0) return [];
        return [{ member, assignedCount: assignedContacts.length, remainingToCall }];
      }),
    [contactsByStaff, staff]
  );

  const metricContacts = useMemo(() => {
    if (!selectedMetric) return [];
    return contacts.filter((contact) => {
      if (selectedMetric === "leads") return true;
      if (selectedMetric === "interested") return normalizeCallActionItem(contact.current_status) === "Interested";
      if (selectedMetric === "notInterested") return normalizeCallActionItem(contact.current_status) === "Not Interested";
      if (selectedMetric === "wrongNumber") return normalizeCallActionItem(contact.current_status) === "Wrong Number";
      if (selectedMetric === "noAnswerCallback") return normalizeCallActionItem(contact.current_status) === "No Answer / Callback";
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
        query = query.eq("status", "Order Placed");
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
    notInterested: "Not Interested Leads",
    wrongNumber: "Wrong Number Leads",
    noAnswerCallback: "No Answer / Callback Leads",
    orders: "Orders",
    unassigned: "Unassigned Leads",
    overdue: "Overdue Follow-ups",
  };

  const metricCards: { key: MetricKey; label: string; value: number; valueClass: string }[] = stats
    ? [
        { key: "leads", label: "Total Leads", value: stats.totalContacts, valueClass: "text-gray-900" },
        { key: "callsToday", label: "Calls Today", value: stats.totalCallsToday, valueClass: "text-emerald-600" },
        { key: "interested", label: "Interested", value: stats.interested, valueClass: "text-blue-600" },
        { key: "notInterested", label: "Not Interested", value: stats.notInterested, valueClass: "text-rose-600" },
        { key: "wrongNumber", label: "Wrong Number", value: stats.wrongNumber, valueClass: "text-orange-600" },
        { key: "noAnswerCallback", label: "No Answer / Callback", value: stats.noAnswerCallback, valueClass: "text-amber-600" },
        { key: "orders", label: "Orders", value: stats.orders, valueClass: "text-purple-600" },
        { key: "unassigned", label: "Unassigned", value: stats.unassigned, valueClass: "text-rose-600" },
        { key: "overdue", label: "Overdue", value: stats.overdueFollowUps, valueClass: "text-orange-600" },
      ]
    : [];

  const assignedToStaff = (staffId: string) => contactsByStaff.get(staffId) || [];

  const openStaffActivity = async (member: StaffMember) => {
    setStaffActivityTarget(member);
    setStaffActivityView("staff-detail");
    setStaffActivityCalls([]);
    setStaffActivityError(null);
    if (!supabase) {
      setStaffActivityError("Supabase is not configured.");
      return;
    }

    setIsStaffActivityLoading(true);
    try {
      const calls: StaffActivityCall[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("calls")
          .select("id, contact_id, user_id, status, action, notes, called_at")
          .eq("user_id", member.id)
          .order("called_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data || []) as StaffActivityCall[];
        calls.push(...page);
        if (page.length < pageSize) break;
      }
      setStaffActivityCalls(calls);
    } catch (error: unknown) {
      setStaffActivityError(error instanceof Error ? error.message : "Could not load staff activity.");
    } finally {
      setIsStaffActivityLoading(false);
    }
  };

  const exportFilteredContacts = async (format: "csv" | "pdf") => {
    try {
      const rows = filteredContacts.map((contact) => ({
        Contact: contact.name,
        Category: contact.category,
        Zone: contact.zone,
        Phone: contact.phone_raw,
        Status: contact.current_status,
        "Next follow-up": contact.next_follow_up_at || "",
        "Assigned to": staff.find((member) => member.id === contact.assigned_to)?.name || "Unassigned",
      }));
      const date = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        downloadCsvReport(`horeca-leads-${date}.csv`, rows);
      } else {
        await downloadPdfReport(
          `horeca-leads-${date}.pdf`,
          "Horeca CRM — Lead Report",
          `${filteredContacts.length} leads · Exported ${new Date().toLocaleString("en-IN")}`,
          ["Contact", "Category", "Zone", "Phone", "Status", "Follow-up", "Assigned to"],
          rows.map((row) => [
            row.Contact,
            row.Category,
            row.Zone,
            row.Phone,
            row.Status,
            row["Next follow-up"] ? new Date(row["Next follow-up"]).toLocaleString("en-IN") : "—",
            row["Assigned to"],
          ])
        );
      }
    } catch (error: unknown) {
      setDashboardError(error instanceof Error ? error.message : "Could not export lead report.");
    }
  };

  const exportStaffReport = async (format: "csv" | "pdf") => {
    if (!staffActivityTarget) return;
    try {
      const assigned = assignedToStaff(staffActivityTarget.id);
      const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
      const rows = [
        ...assigned.map((contact) => ({
          "Record type": "Assignment",
          Staff: staffActivityTarget.name,
          Contact: contact.name,
          Category: contact.category,
          Zone: contact.zone,
          Phone: contact.phone_raw,
          "Current status": contact.current_status,
          "Next follow-up": contact.next_follow_up_at || "",
          "Call date": "",
          "Action item": "",
          Outcome: "",
          Notes: "",
        })),
        ...staffActivityCalls.map((call) => {
          const contact = contactById.get(call.contact_id);
          return {
            "Record type": "Call",
            Staff: staffActivityTarget.name,
            Contact: contact?.name || "Contact no longer available",
            Category: contact?.category || "",
            Zone: contact?.zone || "",
            Phone: contact?.phone_raw || "",
            "Current status": contact?.current_status || "",
            "Next follow-up": contact?.next_follow_up_at || "",
            "Call date": call.called_at,
            "Action item": normalizeCallActionItem(call.status),
            Outcome: normalizeCallOutcome(call.action) || "",
            Notes: call.notes || "",
          };
        }),
      ];
      const date = new Date().toISOString().slice(0, 10);
      const filename = `horeca-${staffActivityTarget.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-activity-${date}`;
      if (format === "csv") {
        downloadCsvReport(`${filename}.csv`, rows);
      } else {
        await downloadPdfReport(
          `${filename}.pdf`,
          `Horeca CRM — ${staffActivityTarget.name}`,
          `${assigned.length} currently assigned leads · ${staffActivityCalls.length} call records (all time)`,
          ["Type", "Contact", "Category", "Zone", "Phone", "Current status", "Follow-up", "Call date", "Action item", "Outcome", "Notes"],
          rows.map((row) => [
            row["Record type"],
            row.Contact,
            row.Category,
            row.Zone,
            row.Phone,
            row["Current status"],
            row["Next follow-up"] ? new Date(row["Next follow-up"]).toLocaleString("en-IN") : "—",
            row["Call date"] ? new Date(row["Call date"]).toLocaleString("en-IN") : "—",
            row["Action item"],
            row.Outcome,
            row.Notes,
          ])
        );
      }
    } catch (error: unknown) {
      setStaffActivityError(error instanceof Error ? error.message : "Could not export staff report.");
    }
  };

  const selectedStaffContacts = staffActivityTarget ? assignedToStaff(staffActivityTarget.id) : [];
  const assignedStatusCounts = selectedStaffContacts.reduce<Record<string, number>>((counts, contact) => {
    counts[contact.current_status] = (counts[contact.current_status] || 0) + 1;
    return counts;
  }, {});
  const callActionCounts = staffActivityCalls.reduce<Record<string, number>>((counts, call) => {
    const actionItem = normalizeCallActionItem(call.status);
    counts[actionItem] = (counts[actionItem] || 0) + 1;
    return counts;
  }, {});
  const callOutcomeCounts = staffActivityCalls.reduce<Record<string, number>>((counts, call) => {
    const outcome = normalizeCallOutcome(call.action);
    if (outcome) counts[outcome] = (counts[outcome] || 0) + 1;
    return counts;
  }, {});

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
    setSkippedImportRows(null);
    setDuplicateImportLog(null);
    setUploadFeedback("Parsing CSV...");

    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { validContacts, inFileDataDuplicates, invalidRows } = processCsvBatch(results.data);
          setSkippedImportRows(
            invalidRows.length > 0
              ? {
                  rows: invalidRows,
                  headers: results.meta.fields || Object.keys(invalidRows[0].row),
                  fileName: file.name.replace(/\.csv$/i, ""),
                }
              : null
          );
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
            setPendingImport({
              uniqueContacts,
              duplicateGroups,
              headers: results.meta.fields || Object.keys(results.data[0] || {}),
              fileName: file.name.replace(/\.csv$/i, ""),
            });
            setDuplicateChoices(
              Object.fromEntries(duplicateGroups.map(({ phone }) => [phone, "merge" as DuplicateChoice]))
            );
          } else {
            if (uniqueContacts.length > 0) await insertContactsBatch(uniqueContacts);
            setUploadFeedback(`Import complete: ${uniqueContacts.length} added, ${invalidRows.length} skipped.`);
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
      const duplicateAuditRows = pendingImport.duplicateGroups.flatMap((group) => {
        const choice = duplicateChoices[group.phone] || "merge";
        return group.contacts.map((contact, index): DuplicateImportAuditRow => {
          if (choice === "ignore") {
            return {
              row: contact.sourceRow,
              recordNumber: contact.sourceRecordNumber,
              phone: group.phone,
              resolution: "Skipped by selection",
              result: "Skipped",
            };
          }
          if (choice === "keep") {
            return {
              row: contact.sourceRow,
              recordNumber: contact.sourceRecordNumber,
              phone: group.phone,
              resolution: "Imported all duplicate CSV rows",
              result: "Imported",
            };
          }
          if (group.existsInDb) {
            return {
              row: contact.sourceRow,
              recordNumber: contact.sourceRecordNumber,
              phone: group.phone,
              resolution: "Matching phone already exists in database; CSV row not imported",
              result: "Skipped",
            };
          }
          const isFirst = index === 0;
          return {
            row: contact.sourceRow,
            recordNumber: contact.sourceRecordNumber,
            phone: group.phone,
            resolution: isFirst
              ? "First CSV row kept for this phone"
              : "Duplicate CSV row skipped; first row kept",
            result: isFirst ? "Imported" : "Skipped",
          };
        });
      });
      const selectedDuplicates = pendingImport.duplicateGroups.flatMap((group) => {
        const choice = duplicateChoices[group.phone] || "merge";
        if (choice === "ignore" || (choice === "merge" && group.existsInDb)) return [];
        return choice === "keep" ? group.contacts : group.contacts.slice(0, 1);
      });
      const contactsToInsert = [...pendingImport.uniqueContacts, ...selectedDuplicates];
      if (contactsToInsert.length > 0) await insertContactsBatch(contactsToInsert);
      const skippedDuplicateCount = duplicateAuditRows.filter((row) => row.result === "Skipped").length;
      setUploadFeedback(
        `Import complete: ${contactsToInsert.length} added, ${skippedImportRows?.rows.length || 0} invalid rows skipped, ${skippedDuplicateCount} duplicate rows skipped.`
      );
      setDuplicateImportLog(
        duplicateAuditRows.length > 0
          ? {
              rows: duplicateAuditRows,
              headers: pendingImport.headers,
              fileName: pendingImport.fileName,
            }
          : null
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
      <header className="w-full border-b border-gray-200 bg-white px-3 py-4 sm:px-4">
        <div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
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

      <main className="mx-auto w-full min-w-0 space-y-4 px-2 py-4 sm:px-4 md:py-6">
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

        {skippedImportRows && (
          <section className="w-full border border-amber-300 bg-amber-50 p-3 sm:p-4" aria-labelledby="skipped-import-rows-title">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 id="skipped-import-rows-title" className="text-sm font-bold text-amber-950">
                  {skippedImportRows.rows.length} skipped CSV {skippedImportRows.rows.length === 1 ? "record" : "records"}
                </h2>
                <p className="mt-1 text-xs text-amber-900">
                  These records were not imported. Review the reason and original values below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const rows = skippedImportRows.rows.map(({ row, reason, recordNumber }) => ({
                    "CSV record": String(recordNumber),
                    "Import skip reason": reason,
                    ...Object.fromEntries(
                      skippedImportRows.headers.map((header) => [`CSV: ${header}`, row[header] || ""])
                    ),
                  }));
                  const fileBase = skippedImportRows.fileName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "import";
                  downloadCsvReport(`skipped-rows-${fileBase}.csv`, rows);
                }}
                className="min-h-10 shrink-0 border border-amber-700 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
              >
                Download skipped rows CSV
              </button>
            </div>
            <div className="mt-3 max-h-96 overflow-auto border border-amber-200 bg-white">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-amber-100 text-amber-950">
                  <tr>
                    <th scope="col" className="whitespace-nowrap border-b border-amber-200 px-3 py-2">Record</th>
                    <th scope="col" className="min-w-48 border-b border-amber-200 px-3 py-2">Skip reason</th>
                    {skippedImportRows.headers.map((header) => (
                      <th key={header} scope="col" className="min-w-32 whitespace-nowrap border-b border-amber-200 px-3 py-2">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skippedImportRows.rows.map(({ row, reason, recordNumber }) => (
                    <tr key={recordNumber} className="align-top odd:bg-white even:bg-gray-50">
                      <td className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-mono">{recordNumber}</td>
                      <td className="min-w-48 border-b border-gray-200 px-3 py-2 font-medium">{reason}</td>
                      {skippedImportRows.headers.map((header) => (
                        <td key={header} className="min-w-32 border-b border-gray-200 px-3 py-2">
                          {row[header] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {duplicateImportLog && (
          <section className="w-full border border-indigo-300 bg-indigo-50 p-3 sm:p-4" aria-labelledby="duplicate-import-log-title">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 id="duplicate-import-log-title" className="text-sm font-bold text-indigo-950">
                  Duplicate import log ({duplicateImportLog.rows.length} CSV {duplicateImportLog.rows.length === 1 ? "record" : "records"})
                </h2>
                <p className="mt-1 text-xs text-indigo-900">
                  Original CSV values and the import decision for each duplicate record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const rows = duplicateImportLog.rows.map(({ row, recordNumber, phone, resolution, result }) => ({
                    "CSV record": String(recordNumber),
                    "Normalized phone": phone,
                    "Import result": result,
                    "Duplicate decision": resolution,
                    ...Object.fromEntries(
                      duplicateImportLog.headers.map((header) => [`CSV: ${header}`, row[header] || ""])
                    ),
                  }));
                  const fileBase = duplicateImportLog.fileName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "import";
                  downloadCsvReport(`duplicate-rows-${fileBase}.csv`, rows);
                }}
                className="min-h-10 shrink-0 border border-indigo-700 bg-white px-3 py-2 text-xs font-semibold text-indigo-950 hover:bg-indigo-100"
              >
                Download duplicate log CSV
              </button>
            </div>
            <div className="mt-3 max-h-96 overflow-auto border border-indigo-200 bg-white">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-indigo-100 text-indigo-950">
                  <tr>
                    <th scope="col" className="whitespace-nowrap border-b border-indigo-200 px-3 py-2">Record</th>
                    <th scope="col" className="whitespace-nowrap border-b border-indigo-200 px-3 py-2">Normalized phone</th>
                    <th scope="col" className="whitespace-nowrap border-b border-indigo-200 px-3 py-2">Import result</th>
                    <th scope="col" className="min-w-56 border-b border-indigo-200 px-3 py-2">Duplicate decision</th>
                    {duplicateImportLog.headers.map((header) => (
                      <th key={header} scope="col" className="min-w-32 whitespace-nowrap border-b border-indigo-200 px-3 py-2">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {duplicateImportLog.rows.map(({ row, recordNumber, phone, resolution, result }) => (
                    <tr key={recordNumber} className="align-top odd:bg-white even:bg-gray-50">
                      <td className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-mono">{recordNumber}</td>
                      <td className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-mono">{phone}</td>
                      <td className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-semibold">{result}</td>
                      <td className="min-w-56 border-b border-gray-200 px-3 py-2">{resolution}</td>
                      {duplicateImportLog.headers.map((header) => (
                        <td key={header} className="min-w-32 border-b border-gray-200 px-3 py-2">
                          {row[header] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {stats && (
          <CollapsibleGroup title="Dashboard metrics" count={metricCards.length}>
            <div className="crm-colorful-list space-y-2">
              {metricCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => void openMetricDetails(card.key)}
                  aria-label={`View ${card.label.toLowerCase()} details`}
                  className="crm-color-card flex min-h-16 w-full touch-manipulation items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 active:scale-[0.99]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold leading-tight text-gray-500">{card.label}</span>
                  </span>
                  <span className={`shrink-0 text-xl font-bold ${card.valueClass}`}>{card.value}</span>
                </button>
              ))}
            </div>
          </CollapsibleGroup>
        )}

        {staffAssignmentAlerts.length > 0 && (
          <CollapsibleGroup title="New staff assignments may be needed" count={staffAssignmentAlerts.length}>
            <section aria-labelledby="staff-assignment-alert-heading" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="staff-assignment-alert-heading" className="text-sm font-bold text-amber-900">
                  New staff assignments may be needed
                </h2>
                <p className="mt-1 text-xs text-amber-800">
                  These staff members have no untouched leads left in their current assignments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStaffActivityView("staff-list")}
                className="min-h-10 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Open staff activity
              </button>
            </div>
            <ul className="mt-3 divide-y divide-amber-200">
              {staffAssignmentAlerts.map(({ member, assignedCount, remainingToCall }) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm font-semibold text-amber-950">{member.name}</span>
                  <span className="text-xs text-amber-800">
                    {assignedCount === 0
                      ? "No contacts currently assigned"
                      : `${assignedCount} assigned · ${remainingToCall} not contacted`}
                  </span>
                </li>
              ))}
            </ul>
            </section>
          </CollapsibleGroup>
        )}

        <CollapsibleGroup title="Activity calendar">
          <ActivityCalendar
            contacts={contacts}
            staffOptions={staff.map(({ id, name }) => ({ id, name }))}
          />
        </CollapsibleGroup>

        <CollapsibleGroup title="Staff Activity" count={staff.length}>
          <button
            type="button"
            onClick={() => setStaffActivityView("staff-list")}
            aria-label="Open staff activity dashboard"
            className="crm-color-card flex min-h-16 w-full touch-manipulation items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block text-base font-bold uppercase leading-tight text-gray-500">Staff activity</span>
            </span>
            <span className="shrink-0 text-xl font-bold text-emerald-600">{staff.length}</span>
          </button>
        </CollapsibleGroup>

        <CollapsibleGroup title="Leads" count={filteredContacts.length}>
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700">Export the leads matching the current filters</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void exportFilteredContacts("csv")}
                disabled={filteredContacts.length === 0}
                className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => void exportFilteredContacts("pdf")}
                disabled={filteredContacts.length === 0}
                className="min-h-10 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download PDF
              </button>
            </div>
          </div>
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
              {CALL_ACTION_ITEMS.map((actionItem) => (
                <option key={actionItem} value={actionItem}>{actionItem}</option>
              ))}
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

          <div className="crm-colorful-list space-y-3 pb-2">
            {filteredContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No leads match the filters.</p>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContactIds.has(contact.id);
                const assignedStaffMember = staff.find((member) => member.id === contact.assigned_to);
                return (
                  <article
                    key={contact.id}
                    className={`crm-color-card min-w-0 rounded-xl border p-3 transition ${
                      isSelected ? "ring-2 ring-white" : ""
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
        </CollapsibleGroup>
      </main>

      {staffActivityView === "staff-list" && (
        <div className="fixed inset-0 z-50 flex min-h-dvh flex-col overflow-y-auto bg-gray-50">
          <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Staff Activity</h1>
              <p className="mt-1 text-xs text-gray-500">Choose a staff member to view their detailed report.</p>
            </div>
            <button
              type="button"
              onClick={() => setStaffActivityView("dashboard")}
              className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              ← Admin dashboard
            </button>
          </header>
          <main className="w-full flex-1 space-y-4 p-4 sm:p-6">
            {staff.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                No active staff accounts are available.
              </p>
            ) : (
              <CollapsibleGroup title="Active staff" count={staff.length}>
                <div className="crm-colorful-list space-y-2">
                  {staff.map((member) => {
                    const assigned = assignedToStaff(member.id);
                    const completed = assigned.filter((contact) => contact.current_status !== "Not Contacted").length;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => void openStaffActivity(member)}
                        aria-label={`View ${member.name}'s detailed activity report`}
                        className="crm-color-card flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-gray-900">{member.name}</span>
                          <span className="mt-1 block text-xs text-gray-600">
                            {assigned.length} assigned · {completed} with an outcome
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-emerald-800">View report →</span>
                      </button>
                    );
                  })}
                </div>
              </CollapsibleGroup>
            )}
          </main>
        </div>
      )}

      {staffActivityView === "staff-detail" && staffActivityTarget && (
        <div className="fixed inset-0 z-50 flex min-h-dvh flex-col overflow-hidden bg-gray-50">
          <section
            aria-labelledby="staff-activity-title"
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4 sm:p-5">
              <div>
                <h2 id="staff-activity-title" className="text-lg font-bold text-gray-900">
                  {staffActivityTarget.name} — Staff Activity
                </h2>
                <p className="mt-1 text-xs text-gray-500">Assignment status and all-time call outcomes</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStaffActivityTarget(null);
                    setStaffActivityView("staff-list");
                  }}
                  className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  ← Staff list
                </button>
                <button
                  type="button"
                  onClick={() => void exportStaffReport("csv")}
                  disabled={isStaffActivityLoading || (selectedStaffContacts.length === 0 && staffActivityCalls.length === 0)}
                  className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => void exportStaffReport("pdf")}
                  disabled={isStaffActivityLoading || (selectedStaffContacts.length === 0 && staffActivityCalls.length === 0)}
                  className="min-h-10 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStaffActivityTarget(null);
                    setStaffActivityView("dashboard");
                  }}
                  className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Admin dashboard
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
              {staffActivityError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {staffActivityError}
                </p>
              )}
              {isStaffActivityLoading ? (
                <p className="py-12 text-center text-sm text-gray-500">Loading staff call history...</p>
              ) : (
                <>
                  <CollapsibleGroup title="Activity summary" count={4}>
                    <div className="crm-colorful-list space-y-2">
                    {[
                      { label: "Currently assigned", value: selectedStaffContacts.length },
                      { label: "Leads with outcome", value: selectedStaffContacts.filter((contact) => contact.current_status !== "Not Contacted").length },
                      { label: "Call records", value: staffActivityCalls.length },
                      { label: "Orders recorded", value: staffActivityCalls.filter((call) => call.status === "Order Placed").length },
                    ].map((item) => (
                      <div key={item.label} className="crm-color-card flex items-center justify-between gap-3 border px-4 py-3">
                        <p className="text-[10px] font-bold uppercase text-gray-500">{item.label}</p>
                        <p className="text-xl font-bold text-gray-900">{item.value}</p>
                      </div>
                    ))}
                    </div>
                  </CollapsibleGroup>

                  <CollapsibleGroup title="Assigned lead status" count={Object.keys(assignedStatusCounts).length}>
                    {Object.keys(assignedStatusCounts).length === 0 ? (
                      <p className="text-xs text-gray-500">No leads are currently assigned to this staff member.</p>
                    ) : (
                      <div className="crm-colorful-list space-y-2">
                        {Object.entries(assignedStatusCounts).map(([status, count]) => (
                          <div key={status} className="crm-color-card flex items-center justify-between gap-3 border px-4 py-3 text-sm">
                            <span className="font-semibold text-gray-700">{status}</span>
                            <span className="font-bold text-gray-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleGroup>

                  <CollapsibleGroup title="Call actions and outcomes" count={staffActivityCalls.length}>
                    {staffActivityCalls.length === 0 ? (
                      <p className="text-xs text-gray-500">No call records have been logged by this staff member.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="crm-colorful-list space-y-2">
                          <h3 className="text-sm font-bold text-gray-900">Call action items</h3>
                          {Object.entries(callActionCounts).map(([actionItem, count]) => (
                            <div key={actionItem} className="crm-color-card flex items-center justify-between gap-3 border px-4 py-3 text-sm">
                              <span className="font-semibold text-blue-800">{actionItem}</span>
                              <span className="font-bold text-blue-800">{count}</span>
                            </div>
                          ))}
                        </div>
                        <div className="crm-colorful-list space-y-2">
                          <h3 className="text-sm font-bold text-gray-900">Outcomes</h3>
                          {Object.entries(callOutcomeCounts).map(([outcome, count]) => (
                            <div key={outcome} className="crm-color-card flex items-center justify-between gap-3 border px-4 py-3 text-sm">
                              <span className="font-semibold text-purple-800">{outcome}</span>
                              <span className="font-bold text-purple-800">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CollapsibleGroup>

                  <CollapsibleGroup title="Current assignments" count={selectedStaffContacts.length}>
                    {selectedStaffContacts.length === 0 ? (
                      <p className="text-xs text-gray-500">No current assignments.</p>
                    ) : (
                      <div className="crm-colorful-list space-y-2">
                        {selectedStaffContacts.map((contact) => (
                          <article key={contact.id} className="crm-color-card min-w-0 rounded-xl border p-3">
                            <h4 className="break-words text-sm font-semibold text-gray-900">{contact.name}</h4>
                            <p className="mt-1 text-xs text-gray-500">{contact.category} · {contact.zone}</p>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">
                                {contact.current_status}
                              </span>
                              <span className="font-mono text-gray-600">{contact.phone_raw}</span>
                            </div>
                            {contact.next_follow_up_at && (
                              <p className="mt-2 text-xs text-blue-700">
                                Follow-up: {new Date(contact.next_follow_up_at).toLocaleString("en-IN")}
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </CollapsibleGroup>

                  <CollapsibleGroup title="Call history" count={staffActivityCalls.length}>
                    {staffActivityCalls.length === 0 ? (
                      <p className="text-xs text-gray-500">No call history.</p>
                    ) : (
                      <div className="crm-colorful-list space-y-2">
                        {staffActivityCalls.map((call) => {
                          const contact = contacts.find((item) => item.id === call.contact_id);
                          return (
                            <article key={call.id} className="crm-color-card rounded-xl border p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900">
                                    {contact?.name || "Contact no longer available"}
                                  </h4>
                                  {contact && <p className="mt-0.5 text-xs text-gray-500">{contact.category} · {contact.zone} · {contact.phone_raw}</p>}
                                </div>
                                <time className="text-xs text-gray-500">
                                  {new Date(call.called_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                </time>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
                                  {normalizeCallActionItem(call.status)}
                                </span>
                                {call.action && (
                                  <span className="rounded-full bg-purple-50 px-2.5 py-1 font-semibold text-purple-800">
                                    {normalizeCallOutcome(call.action)}
                                  </span>
                                )}
                              </div>
                              {call.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-gray-600">{call.notes}</p>}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleGroup>
                </>
              )}
            </div>
          </section>
        </div>
      )}

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
                      ? "Call records with the Order Placed outcome"
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
                  <CollapsibleGroup title={metricTitle[selectedMetric]} count={metricCalls.length}>
                    <div className="crm-colorful-list space-y-2">
                      {metricCalls.map((call) => {
                      const contact = contacts.find((item) => item.id === call.contact_id);
                      const caller = staff.find((member) => member.id === call.user_id);
                      return (
                        <article key={call.id} className="crm-color-card rounded-xl border p-3 sm:p-4">
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
                              {normalizeCallActionItem(call.status)}
                            </span>
                            {call.action && (
                              <span className="rounded-full bg-purple-50 px-2.5 py-1 font-semibold text-purple-700">
                                {normalizeCallOutcome(call.action)}
                              </span>
                            )}
                            {caller && <span className="px-1 py-1 text-gray-500">By {caller.name}</span>}
                          </div>
                          {call.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{call.notes}</p>}
                        </article>
                      );
                      })}
                    </div>
                  </CollapsibleGroup>
                )
              ) : metricContacts.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">No matching contacts found.</p>
              ) : (
                <CollapsibleGroup title={metricTitle[selectedMetric]} count={metricContacts.length}>
                  <div className="crm-colorful-list space-y-2">
                    {metricContacts.map((contact) => {
                    const assignedMember = staff.find((member) => member.id === contact.assigned_to);
                    return (
                      <article key={contact.id} className="crm-color-card min-w-0 rounded-xl border p-3">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="break-words text-sm font-semibold text-gray-900">{contact.name}</h3>
                            <a
                              href={`tel:+91${contact.phone_normalized}`}
                              className="mt-1 inline-block min-h-8 py-1 font-mono text-sm text-emerald-800 underline underline-offset-2"
                            >
                              {contact.phone_raw}
                            </a>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            {contact.current_status}
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-1 gap-y-2 text-xs sm:grid-cols-2">
                          <div className="min-w-0">
                            <dt className="text-gray-500">Category / Zone</dt>
                            <dd className="break-words font-medium text-gray-800">{contact.category} · {contact.zone}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500">Assigned to</dt>
                            <dd className="break-words font-medium text-gray-800">{assignedMember?.name || "Unassigned"}</dd>
                          </div>
                          <div className="min-w-0 sm:col-span-2">
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
                </CollapsibleGroup>
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
                  Choose how to handle each matching number. No fields are combined into existing records; each CSV row and its decision will be logged after import.
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
                    <option value="merge">
                      {group.existsInDb
                        ? "Keep existing database record; skip CSV rows"
                        : "Keep first CSV row; skip duplicate rows"}
                    </option>
                    <option value="keep">
                      {group.existsInDb ? "Import all CSV rows anyway" : "Keep all CSV rows"}
                    </option>
                    <option value="ignore">Skip all CSV rows</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">
                {pendingImport.uniqueContacts.length} unique contacts will be added; skipped records are listed on the dashboard after this review.
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
          <div className="mx-auto flex w-full flex-col items-center justify-between gap-3 sm:flex-row">
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