export interface RawCsvRow {
  Category?: string;
  Zone?: string;
  Name?: string;
  Phone?: string;
  Address?: string;
  Rating?: string;
  Reviews?: string;
}

export interface NormalizedContact {
  name: string;
  category: string;
  zone: string;
  address: string;
  google_rating: number | null;
  google_reviews: number | null;
  phone_raw: string;
  phone_normalized: string;
}

export interface ParseResult {
  validContacts: NormalizedContact[];
  inFileDataDuplicates: NormalizedContact[];
  invalidRows: { row: RawCsvRow; reason: string }[];
}

export function normalizeIndianPhone(rawPhone: string): { normalized: string; isValid: boolean } {
  if (!rawPhone) return { normalized: "", isValid: false };

  let digits = rawPhone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  const isValid = /^[6-9]\d{9}$/.test(digits);
  return { normalized: digits, isValid };
}

export function processCsvBatch(rows: RawCsvRow[]): ParseResult {
  const seenPhoneNumbers = new Set<string>();
  const validContacts: NormalizedContact[] = [];
  const inFileDataDuplicates: NormalizedContact[] = [];
  const invalidRows: { row: RawCsvRow; reason: string }[] = [];

  for (const row of rows) {
    if (!row.Phone || !row.Name) {
      invalidRows.push({ row, reason: "Missing Name or Phone" });
      continue;
    }

    const { normalized, isValid } = normalizeIndianPhone(row.Phone);

    if (!isValid) {
      invalidRows.push({ row, reason: `Invalid Indian mobile format: ${row.Phone}` });
      continue;
    }

    const cleanName = row.Name.replace(/\s*,\s*caterers near me.*$/i, "").trim();

    const contact: NormalizedContact = {
      name: cleanName,
      category: (row.Category || "General").trim().toLowerCase(),
      zone: (row.Zone || "Unassigned").trim(),
      address: (row.Address || "").trim(),
      google_rating: row.Rating ? parseFloat(row.Rating) : null,
      google_reviews: row.Reviews ? parseInt(row.Reviews, 10) : null,
      phone_raw: row.Phone.trim(),
      phone_normalized: normalized,
    };

    if (seenPhoneNumbers.has(normalized)) {
      inFileDataDuplicates.push(contact);
    } else {
      seenPhoneNumbers.add(normalized);
      validContacts.push(contact);
    }
  }

  return { validContacts, inFileDataDuplicates, invalidRows };
}