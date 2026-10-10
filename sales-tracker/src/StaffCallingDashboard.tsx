import React, { useState, useMemo, useEffect } from "react";
import { CollapsibleGroup } from "./CollapsibleGroup";
import { ActivityCalendar } from "./ActivityCalendar";
import { ContactCallingCard, CallLogPayload } from "./ContactCallingCard";
import { CustomerHistoryDrawer, HistoryItem } from "./CustomerHistoryDrawer";
import { supabase } from "./supabaseClient";

export interface ContactItem {
  id: string;
  name: string;
  category: string;
  zone: string;
  address: string;
  phone_raw: string;
  phone_normalized: string;
  current_status: string;
  next_follow_up_at: string | null;
  assigned_to: string | null;
  google_rating: number | null;
  google_reviews: number | null;
}

interface StaffDashboardProps {
  contacts: ContactItem[];
  staffId: string;
  onSaveOutcome: (payload: CallLogPayload) => Promise<void>;
  onFetchHistory: (contactId: string) => Promise<HistoryItem[]>;
}

export const StaffCallingDashboard: React.FC<StaffDashboardProps> = ({
  contacts,
  staffId,
  onSaveOutcome,
  onFetchHistory,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>("To Call");
  const [isContactsMenuOpen, setIsContactsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeContact, setActiveContact] = useState<ContactItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ContactItem | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [orderContactIds, setOrderContactIds] = useState<Set<string>>(new Set());
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const filterTabs = [
    "To Call",
    "Follow-up",
    "Interested",
    "Not Interested",
    "Wrong Number",
    "No Answer / Callback",
    "Orders",
    "All",
  ];

  useEffect(() => {
    let isCurrent = true;
    const loadOrderContactIds = async () => {
      if (!supabase) {
        setOrdersError("Supabase is not configured.");
        return;
      }
      setOrdersError(null);
      try {
        const ids = new Set<string>();
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from("calls")
            .select("contact_id")
            .eq("action", "Order Placed")
            .order("contact_id")
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          const page = data || [];
          page.forEach((row) => ids.add(row.contact_id));
          if (page.length < pageSize) break;
        }
        if (isCurrent) setOrderContactIds(ids);
      } catch (error) {
        if (isCurrent) {
          setOrdersError(error instanceof Error ? error.message : "Could not load order records.");
        }
      }
    };
    void loadOrderContactIds();
    return () => {
      isCurrent = false;
    };
  }, [contacts, staffId]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone_raw.includes(searchQuery) ||
        c.zone.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedFilter === "To Call") return c.current_status === "Not Contacted";
      if (selectedFilter === "Follow-up") return Boolean(c.next_follow_up_at);
      if (selectedFilter === "All") return true;
      if (selectedFilter === "Orders") return orderContactIds.has(c.id);
      if (selectedFilter === "Interested") return c.current_status === "Interested";

      return c.current_status === selectedFilter;
    });
  }, [contacts, orderContactIds, selectedFilter, searchQuery]);

  const activeContactIndex = activeContact
    ? filteredContacts.findIndex((contact) => contact.id === activeContact.id)
    : -1;

  const moveActiveContact = (offset: -1 | 1) => {
    const nextContact = filteredContacts[activeContactIndex + offset];
    if (nextContact) setActiveContact(nextContact);
  };

  const handleOpenHistory = async (contact: ContactItem) => {
    setHistoryTarget(contact);
    const items = await onFetchHistory(contact.id);
    setHistoryItems(items);
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-gray-50 pb-20">
      <header className="sticky top-0 z-30 w-full border-b border-gray-200 bg-white px-3 py-3 shadow-xs sm:px-4">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsContactsMenuOpen(true)}
            aria-expanded={isContactsMenuOpen}
            aria-controls="staff-contacts-menu"
            className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm font-bold text-gray-900 shadow-xs hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="truncate">Contacts · {selectedFilter}</span>
          </button>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {filteredContacts.length} Leads
          </span>
        </div>
        <div className="mx-auto mt-3 w-full max-w-7xl">
          <input
            type="search"
            placeholder="Search name, zone, or phone..."
            aria-label="Search contacts by name, zone, or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-gray-100 border border-transparent rounded-lg focus:bg-white focus:border-gray-300 outline-none transition"
          />
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 space-y-3 px-2 py-3 sm:px-4 sm:py-5">
        {ordersError && selectedFilter === "Orders" && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {ordersError}
          </p>
        )}
        <CollapsibleGroup title="Activity calendar">
          <ActivityCalendar contacts={contacts} staffId={staffId} />
        </CollapsibleGroup>
        <CollapsibleGroup title={`Contacts · ${selectedFilter}`} count={filteredContacts.length}>
          {filteredContacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No contacts match the selected criteria.</p>
          ) : (
            <div className="crm-colorful-list space-y-3">
              {filteredContacts.map((contact) => (
                <article
                  key={contact.id}
                  className="crm-color-card flex w-full min-w-0 flex-col justify-between rounded-xl border p-3 sm:p-4"
                >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {contact.zone} • {contact.category}
                  </span>
                  <h3 className="break-words text-sm font-bold leading-snug text-gray-900">{contact.name}</h3>
                  <p className="mt-0.5 break-all font-mono text-xs text-gray-500">{contact.phone_raw}</p>
                </div>
                {contact.google_rating && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    ★ {contact.google_rating}
                  </span>
                )}
              </div>

              {contact.next_follow_up_at && (
                <div className="text-[11px] text-blue-600 font-medium mt-2">
                  Follow-up: {new Date(contact.next_follow_up_at).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => handleOpenHistory(contact)}
                  className="py-1.5 text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
                >
                  History
                </button>
                <button
                  type="button"
                  onClick={() => setActiveContact(contact)}
                  className="py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs"
                >
                  Dial / Update
                </button>
              </div>
                </article>
              ))}
            </div>
          )}
        </CollapsibleGroup>
      </main>

      {isContactsMenuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close contacts menu"
            onClick={() => setIsContactsMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/50"
          />
          <aside
            id="staff-contacts-menu"
            aria-label="Contact filters"
            className="staff-menu-slide-in relative flex h-full w-[min(19rem,85vw)] flex-col border-r border-gray-200 bg-white p-4 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Contacts</h2>
                <p className="mt-0.5 text-xs text-gray-500">Choose a queue</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactsMenuOpen(false)}
                aria-label="Close contacts menu"
                className="min-h-10 min-w-10 rounded-lg border border-gray-300 text-lg font-semibold text-gray-600 hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <nav aria-label="Filter contacts" className="space-y-1 overflow-y-auto">
              {filterTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-current={selectedFilter === tab ? "page" : undefined}
                  onClick={() => {
                    setSelectedFilter(tab);
                    setIsContactsMenuOpen(false);
                  }}
                  className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                    selectedFilter === tab
                      ? "bg-emerald-800 text-white shadow-xs"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {activeContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-0">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Call outcome for ${activeContact.name}`}
            className="flex max-h-dvh w-full max-w-none flex-col overflow-hidden bg-white shadow-2xl"
          >
            <nav aria-label="Contact navigation" className="grid shrink-0 grid-cols-3 gap-2 border-b border-gray-200 bg-white p-3">
              <button
                type="button"
                onClick={() => moveActiveContact(-1)}
                disabled={activeContactIndex <= 0}
                className="min-h-12 touch-manipulation rounded-xl border border-gray-300 bg-white px-2 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setActiveContact(null)}
                className="min-h-12 touch-manipulation rounded-xl bg-rose-700 px-2 py-2 text-sm font-bold text-white hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => moveActiveContact(1)}
                disabled={activeContactIndex < 0 || activeContactIndex >= filteredContacts.length - 1}
                className="min-h-12 touch-manipulation rounded-xl bg-emerald-800 px-2 py-2 text-sm font-bold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </nav>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <ContactCallingCard
                key={activeContact.id}
                contact={activeContact}
                onSaveOutcome={async (payload) => {
                  await onSaveOutcome(payload);
                  setActiveContact(null);
                }}
              />
            </div>
          </section>
          </div>
      )}

      <CustomerHistoryDrawer
        isOpen={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        contactName={historyTarget?.name || ""}
        history={historyItems}
      />
    </div>
  );
};