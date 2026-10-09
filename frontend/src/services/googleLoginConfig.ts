const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const isValidGoogleClientId = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value.trim());

export const googleLoginConfigured = isValidGoogleClientId(clientId);

export const googleClientId = googleLoginConfigured ? clientId.trim() : "";
