type EmailReturn = { code: string; state: string; error: boolean };
// Retain the one-use authorization response only in memory, never browser storage.
let pending: EmailReturn | null = null;
export const isEmailConnectionReturn =
  window.location.pathname === "/email-connect";
if (isEmailConnectionReturn) {
  const query = new URLSearchParams(window.location.search);
  pending = {
    code: query.get("code") || "",
    state: query.get("state") || "",
    error: query.has("error"),
  };
  window.history.replaceState(null, "", "/");
}
export function takeEmailConnectionReturn() {
  const result = pending;
  pending = null;
  return result;
}
