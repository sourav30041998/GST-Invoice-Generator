import type {
  AuthStatus,
  Invoice,
  InvoiceDraft,
  InvoiceDraftListItem,
  InvoiceFilters,
  InvoiceListItem,
  InvoicePayload,
  InvoiceWorkbenchResponse,
  InvoiceWorkbenchStatus,
  Preset,
  Settings,
} from "./types";

const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE =
  configuredApiUrl && !configuredApiUrl.includes("localhost:5000")
    ? configuredApiUrl
    : "/api";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let companyCsrfToken: string | null = null;

function setCompanyCsrfToken(token: string | null | undefined) {
  companyCsrfToken = token || null;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  csrfToken?: string | null,
): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (csrfToken && UNSAFE_METHODS.has(method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      issues?: Array<{ path?: string; message?: string }>;
    } | null;
    const firstIssue = body?.issues?.[0];
    const detail = firstIssue?.message
      ? `${firstIssue.path ? `${firstIssue.path}: ` : ""}${firstIssue.message}`
      : body?.message;
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function queryString(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return params.toString() ? `?${params.toString()}` : "";
}

export const api = {
  async authStatus() {
    const status = await request<AuthStatus>("/auth/me");
    setCompanyCsrfToken(status.csrfToken);
    return status;
  },
  async login(email: string, password: string) {
    const status = await request<AuthStatus>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setCompanyCsrfToken(status.csrfToken);
    return status;
  },
  async acceptInvitation(token: string, password: string) {
    const status = await request<AuthStatus>("/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setCompanyCsrfToken(status.csrfToken);
    return status;
  },
  async logout() {
    await request<void>("/auth/logout", { method: "POST" }, companyCsrfToken);
    setCompanyCsrfToken(null);
  },
  getSettings: () => request<Settings>("/settings"),
  updatePreset: (preset: Preset) =>
    request<{ preset: Preset }>(
      "/settings/preset",
      { method: "PUT", body: JSON.stringify(preset) },
      companyCsrfToken,
    ),
  updateLogo: (dataUrl: string) =>
    request<{ logoDataUrl: string }>(
      "/settings/logo",
      { method: "PUT", body: JSON.stringify({ dataUrl }) },
      companyCsrfToken,
    ),
  deleteLogo: () =>
    request<void>("/settings/logo", { method: "DELETE" }, companyCsrfToken),
  clearDatabase: () =>
    request<void>("/settings/database", { method: "DELETE" }, companyCsrfToken),
  nextInvoiceNumber: (prefix: string, invoiceDate: string) =>
    request<{ invNo: string }>(
      `/invoices/next-number?${new URLSearchParams({ prefix, invoiceDate })}`,
    ),
  listInvoices: (filters: InvoiceFilters) =>
    request<InvoiceListItem[]>(`/invoices${queryString(filters)}`),
  listInvoiceWorkbench: (status: InvoiceWorkbenchStatus) =>
    request<InvoiceWorkbenchResponse>(
      `/invoices/workbench${queryString({ status })}`,
    ),
  listInvoiceDrafts: () => request<InvoiceDraftListItem[]>("/invoices/drafts"),
  getInvoice: (invNo: string) =>
    request<Invoice>(`/invoices/${encodeURIComponent(invNo)}`),
  getInvoiceDraft: (draftId: string) =>
    request<InvoiceDraft>(`/invoices/drafts/${encodeURIComponent(draftId)}`),
  createInvoiceDraft: (payload: InvoicePayload) =>
    request<InvoiceDraft>(
      "/invoices/drafts",
      { method: "POST", body: JSON.stringify(payload) },
      companyCsrfToken,
    ),
  updateInvoiceDraft: (
    draftId: string,
    payload: InvoicePayload,
    version: number,
  ) =>
    request<InvoiceDraft | Invoice>(
      `/invoices/drafts/${encodeURIComponent(draftId)}`,
      { method: "PUT", body: JSON.stringify({ ...payload, version }) },
      companyCsrfToken,
    ),
  deleteInvoiceDraft: (draftId: string, version: number) =>
    request<void>(
      `/invoices/drafts/${encodeURIComponent(draftId)}`,
      { method: "DELETE", body: JSON.stringify({ version }) },
      companyCsrfToken,
    ),
  createInvoice: (payload: InvoicePayload) =>
    request<Invoice>(
      "/invoices",
      { method: "POST", body: JSON.stringify(payload) },
      companyCsrfToken,
    ),
  updateInvoice: (invNo: string, payload: InvoicePayload, version: number) =>
    request<Invoice>(
      `/invoices/${encodeURIComponent(invNo)}`,
      { method: "PUT", body: JSON.stringify({ ...payload, version }) },
      companyCsrfToken,
    ),
  cancelInvoice: (invNo: string, version: number) =>
    request<Invoice>(
      `/invoices/${encodeURIComponent(invNo)}/cancel`,
      { method: "PATCH", body: JSON.stringify({ version }) },
      companyCsrfToken,
    ),
  exportCsvUrl: (filters: InvoiceFilters) =>
    `${API_BASE}/invoices/export.csv${queryString(filters)}`,
  async downloadCsv(filters: InvoiceFilters) {
    const response = await fetch(this.exportCsvUrl(filters), {
      credentials: "include",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        body?.message || `Request failed with ${response.status}`,
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gst_invoices_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  },
  listIndianStates: () => request<string[]>("/reference-data/indian-states"),
};
