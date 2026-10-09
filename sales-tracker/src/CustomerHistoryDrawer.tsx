import React from "react";

export interface HistoryItem {
  id: string;
  type: "call" | "audit";
  timestamp: string;
  userName: string;
  status?: string;
  action?: string;
  notes?: string;
  details?: Record<string, any>;
}

interface CustomerHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  history: HistoryItem[];
}

export const CustomerHistoryDrawer: React.FC<CustomerHistoryDrawerProps> = ({
  isOpen,
  onClose,
  contactName,
  history,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{contactName}</h3>
            <p className="text-[11px] text-gray-500">Call Ledger & Audit Trail</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg text-lg">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No interaction records found.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="relative pl-6 pb-2 border-l-2 border-gray-200 last:border-l-0">
                <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-600 ring-4 ring-white" />
                <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                  <span className="font-semibold text-gray-800">{item.userName}</span>
                  <span>{new Date(item.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
                {item.type === "call" ? (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900">{item.status}</span>
                      {item.action && (
                        <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium text-[10px]">
                          {item.action}
                        </span>
                      )}
                    </div>
                    {item.notes && <p className="text-gray-700 mt-1 italic">"{item.notes}"</p>}
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-600 bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                    System Update: {JSON.stringify(item.details)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};