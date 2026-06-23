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
