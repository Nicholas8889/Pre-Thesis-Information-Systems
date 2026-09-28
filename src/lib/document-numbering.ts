export function nextNumberFromExisting({
  existingNumbers,
  prefix,
  year
}: {
  existingNumbers: string[];
  prefix: string;
  year: number;
}) {
  const sequencePrefix = `${prefix}-${year}-`;
  const nextSequence =
    existingNumbers.reduce((maxSequence, documentNumber) => {
      if (!documentNumber.startsWith(sequencePrefix)) {
        return maxSequence;
      }

      const sequence = Number(documentNumber.slice(sequencePrefix.length));
      return Number.isInteger(sequence) && sequence > maxSequence
        ? sequence
        : maxSequence;
    }, 0) + 1;

  return `${sequencePrefix}${String(nextSequence).padStart(3, "0")}`;
}

export const DOCUMENT_NUMBER_TYPES = ["SO", "PO", "INV", "INQ", "SJ"] as const;
export type DocumentNumberType = (typeof DOCUMENT_NUMBER_TYPES)[number];

const jakartaYearFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric"
});

export function getJakartaDocumentYear(date = new Date()) {
  const year = Number(jakartaYearFormatter.format(date));
  if (!Number.isInteger(year)) {
    throw new Error("Unable to determine the Jakarta document year");
  }
  return year;
}

export function formatDocumentNumber(
  documentType: DocumentNumberType,
  year: number,
  sequence: number
) {
  if (!DOCUMENT_NUMBER_TYPES.includes(documentType)) {
    throw new Error("Unsupported document number type");
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Invalid document year");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Invalid document sequence");
  }
  return `${documentType}-${year}-${String(sequence).padStart(3, "0")}`;
}
