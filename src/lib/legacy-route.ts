export type LegacySearchParams = Record<string, string | string[] | undefined>;

export function withSearchParams(pathname: string, params: LegacySearchParams = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function withAllowedSearchParams(
  pathname: string,
  params: LegacySearchParams = {},
  allowedParams: readonly string[],
) {
  const allowed = new Set(allowedParams);
  return withSearchParams(
    pathname,
    Object.fromEntries(Object.entries(params).filter(([key]) => allowed.has(key))),
  );
}
