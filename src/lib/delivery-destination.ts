export function normalizeDeliveryDestination(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("id-ID");
}

export function haveSameDeliveryDestination(values: readonly string[]): boolean {
  if (values.length === 0) return false;
  const identities = values.map(normalizeDeliveryDestination);
  return identities[0].length > 0 && identities.every(identity => identity === identities[0]);
}
