const NPWP_PATTERN = /^\d{15,16}$/;
const NPWP_DISPLAY_SEPARATOR_PATTERN = /[.\-\s]+/g;

export type OptionalNpwpResult =
  | { valid: true; value: string | null }
  | { valid: false; value: null; error: string };

export function normalizeNpwp(value: string) {
  const normalized = value.trim().replace(NPWP_DISPLAY_SEPARATOR_PATTERN, "");
  return normalized || null;
}

export function isValidNormalizedNpwp(value: string | null) {
  return value === null || NPWP_PATTERN.test(value);
}

export function formatNpwp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (/^\d{15}$/.test(value)) {
    return value.replace(
      /^(\d{2})(\d{3})(\d{3})(\d)(\d{3})(\d{3})$/,
      "$1.$2.$3.$4-$5.$6"
    );
  }

  if (/^\d{16}$/.test(value)) {
    return value.replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  return value;
}

export function parseOptionalNpwp(value: unknown): OptionalNpwpResult {
  if (value === null || value === undefined || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return {
      valid: false,
      value: null,
      error: "NPWP must be entered as text"
    };
  }

  const normalized = normalizeNpwp(value);
  if (!isValidNormalizedNpwp(normalized)) {
    return {
      valid: false,
      value: null,
      error: "NPWP must contain 15 or 16 digits"
    };
  }

  return { valid: true, value: normalized };
}
