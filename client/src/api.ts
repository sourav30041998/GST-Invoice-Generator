import type { Invoice, InvoiceFilters, InvoiceListItem, InvoicePayload, Preset, Settings } from "./types";

const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE = configuredApiUrl && !configuredApiUrl.includes("localhost:5000") ? configuredApiUrl : "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    ...init
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function queryString(filters: Partial<InvoiceFilters>) {
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
      body: JSON.stringify(preset)
    }),
  updateLogo: (dataUrl: string) =>
    request<{ logoDataUrl: string }>("/settings/logo", {
      method: "PUT",
      body: JSON.stringify({ dataUrl })
    }),
  deleteLogo: () => request<void>("/settings/logo", { method: "DELETE" }),
  clearDatabase: () => request<void>("/settings/database", { method: "DELETE" }),
  nextInvoiceNumber: (prefix: string, invoiceDate: string) =>
    request<{ invNo: string }>(`/invoices/next-number?${new URLSearchParams({ prefix, invoiceDate })}`),
  listInvoices: (filters: InvoiceFilters) => request<InvoiceListItem[]>(`/invoices${queryString(filters)}`),
  getInvoice: (invNo: string) => request<Invoice>(`/invoices/${encodeURIComponent(invNo)}`),
  createInvoice: (payload: InvoicePayload) =>
    request<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateInvoice: (invNo: string, payload: InvoicePayload) =>
    request<Invoice>(`/invoices/${encodeURIComponent(invNo)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  cancelInvoice: (invNo: string) =>
    request<Invoice>(`/invoices/${encodeURIComponent(invNo)}/cancel`, {
      method: "PATCH"
    }),
  exportCsvUrl: (filters: InvoiceFilters) => `${API_BASE}/invoices/export.csv${queryString(filters)}`
};