<<<<<<< HEAD
import type { Invoice, InvoiceDraft, InvoiceDraftListItem, InvoiceFilters, InvoiceListItem, InvoicePayload, Preset, Settings } from "./types";

const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE = configuredApiUrl && !configuredApiUrl.includes("localhost:5000") ? configuredApiUrl : "/api";
=======
import type {
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
>>>>>>> codex/backend-api-data

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
<<<<<<< HEAD
      ...(init?.headers || {})
    },
    ...init
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
=======
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
>>>>>>> codex/backend-api-data
    throw new Error(body?.message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

<<<<<<< HEAD
function queryString(filters: Partial<InvoiceFilters>) {
=======
function queryString(filters: Record<string, string | undefined>) {
>>>>>>> codex/backend-api-data
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return params.toString() ? `?${params.toString()}` : "";
}

export const api = {
  getSettings: () => request<Settings>("/settings"),
  updatePreset: (preset: Preset) =>
    request<{ preset: Preset }>("/settings/preset", {
      method: "PUT",
<<<<<<< HEAD
      body: JSON.stringify(preset)
=======
      body: JSON.stringify(preset),
>>>>>>> codex/backend-api-data
    }),
  updateLogo: (dataUrl: string) =>
    request<{ logoDataUrl: string }>("/settings/logo", {
      method: "PUT",
<<<<<<< HEAD
      body: JSON.stringify({ dataUrl })
    }),
  deleteLogo: () => request<void>("/settings/logo", { method: "DELETE" }),
  clearDatabase: () => request<void>("/settings/database", { method: "DELETE" }),
  nextInvoiceNumber: (prefix: string, invoiceDate: string) =>
    request<{ invNo: string }>(`/invoices/next-number?${new URLSearchParams({ prefix, invoiceDate })}`),
  listInvoices: (filters: InvoiceFilters) => request<InvoiceListItem[]>(`/invoices${queryString(filters)}`),
  listInvoiceDrafts: () => request<InvoiceDraftListItem[]>("/invoices/drafts"),
  getInvoice: (invNo: string) => request<Invoice>(`/invoices/${encodeURIComponent(invNo)}`),
  getInvoiceDraft: (draftId: string) => request<InvoiceDraft>(`/invoices/drafts/${encodeURIComponent(draftId)}`),
  createInvoiceDraft: (payload: InvoicePayload) =>
    request<InvoiceDraft>("/invoices/drafts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateInvoiceDraft: (draftId: string, payload: InvoicePayload) =>
    request<InvoiceDraft | Invoice>(`/invoices/drafts/${encodeURIComponent(draftId)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteInvoiceDraft: (draftId: string) => request<void>(`/invoices/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" }),
  createInvoice: (payload: InvoicePayload) =>
    request<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload)
=======
      body: JSON.stringify({ dataUrl }),
    }),
  deleteLogo: () => request<void>("/settings/logo", { method: "DELETE" }),
  clearDatabase: () =>
    request<void>("/settings/database", { method: "DELETE" }),
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
    request<InvoiceDraft>("/invoices/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateInvoiceDraft: (draftId: string, payload: InvoicePayload) =>
    request<InvoiceDraft | Invoice>(
      `/invoices/drafts/${encodeURIComponent(draftId)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),
  deleteInvoiceDraft: (draftId: string) =>
    request<void>(`/invoices/drafts/${encodeURIComponent(draftId)}`, {
      method: "DELETE",
    }),
  createInvoice: (payload: InvoicePayload) =>
    request<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
>>>>>>> codex/backend-api-data
    }),
  updateInvoice: (invNo: string, payload: InvoicePayload) =>
    request<Invoice>(`/invoices/${encodeURIComponent(invNo)}`, {
      method: "PUT",
<<<<<<< HEAD
      body: JSON.stringify(payload)
    }),
  cancelInvoice: (invNo: string) =>
    request<Invoice>(`/invoices/${encodeURIComponent(invNo)}/cancel`, {
      method: "PATCH"
    }),
  exportCsvUrl: (filters: InvoiceFilters) => `${API_BASE}/invoices/export.csv${queryString(filters)}`
};
=======
      body: JSON.stringify(payload),
    }),
  cancelInvoice: (invNo: string) =>
    request<Invoice>(`/invoices/${encodeURIComponent(invNo)}/cancel`, {
      method: "PATCH",
    }),
  exportCsvUrl: (filters: InvoiceFilters) =>
    `${API_BASE}/invoices/export.csv${queryString(filters)}`,
  listIndianStates: () => request<string[]>("/reference-data/indian-states"),
};
>>>>>>> codex/backend-api-data
