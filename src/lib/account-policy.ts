export const MAX_USERNAME_LENGTH = 64;
export const MAX_DISPLAY_NAME_LENGTH = 100;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function canonicalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string) {
  const username = canonicalizeUsername(value);
  if (!username) throw new Error("Username is required");
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new Error(`Username must be ${MAX_USERNAME_LENGTH} characters or fewer`);
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw new Error("Username may only contain letters, numbers, dots, underscores, and hyphens");
  }
  return username;
}

export function validateDisplayName(value: string) {
  const displayName = value.trim();
  if (!displayName) throw new Error("Display name is required");
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`);
  }
  return displayName;
}

export function validatePassword(value: string) {
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
    );
  }
  return value;
}
