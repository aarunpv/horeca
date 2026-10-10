export const CALL_ACTION_ITEMS = [
  "Interested",
  "Not Interested",
  "Wrong Number",
  "No Answer / Callback",
] as const;

export type CallActionItem = (typeof CALL_ACTION_ITEMS)[number];

export const CALL_OUTCOMES = [
  "Quote Sent",
  "Followup Required",
  "Order Placed",
  "Meeting Requested",
  "Try Again Later",
  "Callback Requested",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const OUTCOMES_BY_ACTION_ITEM: Record<CallActionItem, readonly CallOutcome[]> = {
  Interested: ["Quote Sent", "Followup Required", "Order Placed", "Meeting Requested"],
  "Not Interested": [],
  "Wrong Number": [],
  "No Answer / Callback": ["Followup Required", "Try Again Later", "Callback Requested"],
};

export const LEGACY_CALL_STATUS_MAP: Record<string, CallActionItem> = {
  Maybe: "Interested",
  "No Answer": "No Answer / Callback",
  "Order Placed": "Interested",
};

export const normalizeCallActionItem = (value: string): string =>
  LEGACY_CALL_STATUS_MAP[value] || value;

export const normalizeCallOutcome = (value: string | null): string | null =>
  value === "Follow-up Required" ? "Followup Required" : value;
