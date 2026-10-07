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

  const filterTabs = ["To Call", "Due Today", "Interested", "Maybe", "No Answer", "All"];

  const filteredContacts = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    return contacts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone_raw.includes(searchQuery) ||
        c.zone.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedFilter === "To Call") return c.current_status === "Not Contacted";
      if (selectedFilter === "Due Today") {
        if (!c.next_follow_up_at) return false;
        const followUpDate = new Date(c.next_follow_up_at);
        return followUpDate >= todayStart && followUpDate < tomorrowStart && c.current_status !== "Not Interested";
      }
      if (selectedFilter === "All") return true;

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
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 pt-3 pb-2 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-base font-bold text-gray-900">Calling Queue</h1>
          <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
            {filteredContacts.length} Leads
          </span>
        </div>

        <input
          type="search"
          placeholder="Search name, zone, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-xs bg-gray-100 border border-transparent rounded-lg focus:bg-white focus:border-gray-300 outline-none transition"
        />

        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2 pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedFilter(tab)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition ${
                selectedFilter === tab
                  ? "bg-gray-900 text-white shadow-xs"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-md mx-auto">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs">
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