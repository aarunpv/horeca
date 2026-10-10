import React, { useState } from "react";
import { generateGoogleCalendarUrl } from "./calendarUtils";
import {
  CALL_ACTION_ITEMS,
  OUTCOMES_BY_ACTION_ITEM,
  type CallActionItem,
  type CallOutcome,
} from "./callOptions";

export interface CallLogPayload {
  contactId: string;
  status: CallActionItem;
  action: CallOutcome | "";
  notes: string;
  followUpDate?: string;
}

interface ContactProps {
  contact: {
    id: string;
    name: string;
    category: string;
    zone: string;
    phone_raw: string;
    phone_normalized: string;
    google_rating: number | null;
  };
  onSaveOutcome: (data: CallLogPayload) => Promise<void>;
}

export const ContactCallingCard: React.FC<ContactProps> = ({ contact, onSaveOutcome }) => {
  const [status, setStatus] = useState<CallActionItem>("Interested");
  const [action, setAction] = useState<CallOutcome | "">("");
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const outcomes = OUTCOMES_BY_ACTION_ITEM[status];
  const requiresFollowUp =
    status === "No Answer / Callback" ||
    action === "Followup Required" ||
    action === "Meeting Requested" ||
    action === "Try Again Later" ||
    action === "Callback Requested";

  const handleStatusChange = (nextStatus: CallActionItem) => {
    const nextOutcomes = OUTCOMES_BY_ACTION_ITEM[nextStatus];
    const nextAction = action && nextOutcomes.includes(action) ? action : "";
    setStatus(nextStatus);
    setAction(nextAction);
    if (!(
      nextStatus === "No Answer / Callback" ||
      nextAction === "Followup Required" ||
      nextAction === "Meeting Requested" ||
      nextAction === "Try Again Later" ||
      nextAction === "Callback Requested"
    )) {
      setFollowUpDate("");
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    if (requiresFollowUp && !followUpDate) {
      setSaveError("Choose a follow-up date and time for this outcome.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveOutcome({
        contactId: contact.id,
        status,
        action,
        notes,
        followUpDate: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save call outcome.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 uppercase">
            {contact.zone} • {contact.category}
          </span>
          <h2 className="text-base font-bold text-gray-900 mt-1">{contact.name}</h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{contact.phone_raw}</p>
        </div>
        {contact.google_rating && (
          <span className="text-xs font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-md">
            ★ {contact.google_rating}
          </span>
        )}
      </div>

      <a
        href={`tel:+91${contact.phone_normalized}`}
        className="w-full flex items-center justify-center gap-2 py-3.5 my-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow active:scale-95 transition"
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.72 11.72 0 003.68.59 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.72 11.72 0 00.59 3.68 1 1 0 01-.24 1.02l-2.23 2.09z"/>
        </svg>
        CALL NOW
      </a>

      <div className="border-t border-gray-100 pt-3 space-y-3">
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase">Call action</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {CALL_ACTION_ITEMS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                aria-pressed={status === s}
                className="call-choice-button"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {outcomes.length > 0 && (
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase">Outcome</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {outcomes.map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => {
                    setAction(act);
                    if (!["Followup Required", "Meeting Requested", "Try Again Later", "Callback Requested"].includes(act)) {
                      setFollowUpDate("");
                    }
                  }}
                  aria-pressed={action === act}
                  className="call-choice-button call-outcome-button"
                >
                  {act}
                </button>
              ))}
            </div>
          </div>
        )}

        {requiresFollowUp && (
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase">Next Follow-Up</label>
            <input
              type="datetime-local"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full mt-1 p-2 text-xs border rounded-lg bg-gray-50 focus:bg-white"
            />
            {followUpDate && (
              <a
                href={generateGoogleCalendarUrl({
                  businessName: contact.name,
                  phone: contact.phone_raw,
                  notes,
                  startTime: new Date(followUpDate),
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold mt-1.5 hover:underline"
              >
                📅 Open in Google Calendar
              </a>
            )}
          </div>
        )}

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key discussion points, pricing, or next steps..."
            className="w-full mt-1 p-2 text-xs border rounded-lg bg-gray-50 focus:bg-white"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save Outcome"}
        </button>
        {saveError && <p role="alert" className="text-xs text-red-700">{saveError}</p>}
      </div>
    </div>
  );
};