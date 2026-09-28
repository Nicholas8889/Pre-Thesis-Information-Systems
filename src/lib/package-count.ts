export const MAX_PACKAGE_COUNT = 2_147_483_647;

export type PackageCountResult =
  | { valid: true; value: number | null }
  | { valid: false; value: null };

export function parsePackageCount(
  value: FormDataEntryValue | null | unknown,
  { required = false }: { required?: boolean } = {}
): PackageCountResult {
  if (typeof value !== "string") return { valid: false, value: null };
  if (value === "") {
    return required
      ? { valid: false, value: null }
      : { valid: true, value: null };
  }
  if (!/^[1-9]\d*$/.test(value)) return { valid: false, value: null };

  const packageCount = Number(value);
  if (!Number.isSafeInteger(packageCount) || packageCount > MAX_PACKAGE_COUNT) {
    return { valid: false, value: null };
  }
  return { valid: true, value: packageCount };
}
