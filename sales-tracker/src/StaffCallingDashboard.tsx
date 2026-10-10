import React, { useState, useMemo } from "react";
import { ContactCallingCard, CallLogPayload } from "./ContactCallingCard";
import { CustomerHistoryDrawer, HistoryItem } from "./CustomerHistoryDrawer";

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
  onSaveOutcome: (payload: CallLogPayload) => Promise<void>;
  onFetchHistory: (contactId: string) => Promise<HistoryItem[]>;
}

export const StaffCallingDashboard: React.FC<StaffDashboardProps> = ({
  contacts,
  onSaveOutcome,
  onFetchHistory,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>("To Call");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeContact, setActiveContact] = useState<ContactItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ContactItem | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const filterTabs = ["To Call", "Follow-up", "Interested", "No Answer / Callback", "Orders", "All"];

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
      if (selectedFilter === "Orders") return c.current_status === "Order Placed";
      if (selectedFilter === "Interested") {
        return ["Interested", "Order Placed"].includes(c.current_status);
      }

      return c.current_status === selectedFilter;
    });
  }, [contacts, selectedFilter, searchQuery]);

  const handleOpenHistory = async (contact: ContactItem) => {
    setHistoryTarget(contact);
    const items = await onFetchHistory(contact.id);
    setHistoryItems(items);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <h1 className="text-base font-bold text-gray-900">Calling Queue</h1>
          <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
            {filteredContacts.length} Leads
          </span>
        </div>
        <div className="mx-auto mt-3 max-w-7xl">
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

      <div className="mx-auto flex max-w-7xl items-start gap-3 p-3 sm:gap-5 sm:p-5">
        <aside className="sticky top-24 w-28 shrink-0 rounded-xl border border-gray-200 bg-white p-2 shadow-xs sm:w-48 sm:p-3">
          <h2 className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-xs">
            Contacts
          </h2>
          <nav aria-label="Filter contacts" className="space-y-1">
            {filterTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                aria-current={selectedFilter === tab ? "page" : undefined}
                onClick={() => setSelectedFilter(tab)}
                className={`w-full rounded-lg px-2 py-2 text-left text-xs font-semibold transition sm:px-3 sm:text-sm ${
                  selectedFilter === tab
                    ? "bg-emerald-800 text-white shadow-xs"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </aside>

      <main className="min-w-0 flex-1 space-y-3">
        {filteredContacts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-xs text-gray-400">
            No contacts match the selected criteria.
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div className="pr-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {contact.zone} • {contact.category}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 leading-snug">{contact.name}</h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{contact.phone_raw}</p>
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
            </div>
          ))
        )}
      </main>
      </div>

      {activeContact && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-2xl relative">
            <button
              onClick={() => setActiveContact(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-sm font-bold z-10 p-1"
            >
              ✕
            </button>
            <ContactCallingCard
              contact={activeContact}
              onSaveOutcome={async (payload) => {
                await onSaveOutcome(payload);
                setActiveContact(null);
              }}
            />
          </div>
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