import type {
  AuthStatus,
  Booking,
  BookingCreateResponse,
  BookingInput,
  BookingListResponse,
  BookingNotificationResult,
  BookingPayment,
  BookingPaymentInput,
  BookingReceipt,
  Customer,
  CustomerInput,
  CustomerListResponse,
  Invoice,
  InvoiceDraft,
  InvoiceDraftListItem,
  InvoiceFilters,
  InvoiceListItem,
  InvoicePayload,
  InvoiceWorkbenchResponse,
  InvoiceWorkbenchStatus,
  PasswordRecoveryCompletionResult,
  PasswordRecoveryRequestResult,
  PasswordRecoveryVerificationResult,
  Preset,
  Room,
  RoomAllocation,
  RoomAllocationHistory,
  RoomBookingBoard,
  RoomInput,
  Settings,
  TaxPreset,
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      method,
      credentials: "include",
      headers,
      signal: init?.signal || AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        "The request timed out. Check the connection and try again.",
      );
    }
    throw error;
  }

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

function isRoomAllocationHistory(
  value: RoomAllocationHistory | RoomAllocation[],
): value is RoomAllocationHistory {
  return !Array.isArray(value) && Array.isArray(value.items);
}

function normalizeLegacyRoomHistory(
  allocations: RoomAllocation[],
  requestedPage: number,
): RoomAllocationHistory {
  const pageSize = 10;
  const historyStart = new Date();
  historyStart.setUTCFullYear(historyStart.getUTCFullYear() - 1);
  const historyStartTime = historyStart.getTime();
  const items = allocations
    .filter((allocation) => {
      const historyDate = Date.parse(
        allocation.createdAt || allocation.checkinDate,
      );
      return Number.isFinite(historyDate) && historyDate >= historyStartTime;
    })
    .sort(
      (left, right) =>
        Date.parse(right.createdAt || right.checkinDate) -
        Date.parse(left.createdAt || left.checkinDate),
    );
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
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
  requestPasswordRecovery: (email: string) =>
    request<PasswordRecoveryRequestResult>("/auth/password-recovery/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  verifyPasswordRecoveryOtp: (challengeToken: string, otp: string) =>
    request<PasswordRecoveryVerificationResult>(
      "/auth/password-recovery/verify",
      {
        method: "POST",
        body: JSON.stringify({ challengeToken, otp }),
      },
    ),
  completePasswordRecovery: (
    challengeToken: string,
    resetToken: string,
    newPassword: string,
    confirmPassword: string,
  ) =>
    request<PasswordRecoveryCompletionResult>("/auth/password-recovery/reset", {
      method: "POST",
      body: JSON.stringify({
        challengeToken,
        resetToken,
        newPassword,
        confirmPassword,
      }),
    }),
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
  updateTaxPresets: (taxPresets: TaxPreset[]) =>
    request<{ taxPresets: TaxPreset[] }>(
      "/settings/tax-presets",
      { method: "PUT", body: JSON.stringify({ taxPresets }) },
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
  listRooms: (status: "active" | "inactive" | "all" = "all", search = "") =>
    request<Room[]>(`/rooms${queryString({ status, search })}`),
  listAvailableRooms: (
    checkinDate: string,
    checkoutDate: string,
    excludeInvoiceId?: string,
    excludeBookingId?: string,
  ) =>
    request<Room[]>(
      `/rooms/availability${queryString({
        checkinDate,
        checkoutDate,
        excludeInvoiceId,
        excludeBookingId,
      })}`,
    ),
  listCustomers: (
    search = "",
    page = 1,
    status: "active" | "inactive" | "all" = "active",
  ) =>
    request<CustomerListResponse>(
      "/customers/search",
      {
        method: "POST",
        body: JSON.stringify({ search, page, status }),
      },
      companyCsrfToken,
    ),
  getCustomer: (customerId: string) =>
    request<Customer>(`/customers/${encodeURIComponent(customerId)}`),
  lookupCustomer: (phone: string) =>
    request<Customer>(
      "/customers/lookup",
      { method: "POST", body: JSON.stringify({ phone }) },
      companyCsrfToken,
    ),
  createCustomer: (customer: CustomerInput) =>
    request<Customer>(
      "/customers",
      { method: "POST", body: JSON.stringify(customer) },
      companyCsrfToken,
    ),
  updateCustomer: (
    customerId: string,
    customer: CustomerInput,
    version: number,
  ) =>
    request<Customer>(
      `/customers/${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ ...customer, version }),
      },
      companyCsrfToken,
    ),
  deactivateCustomer: (customerId: string, version: number) =>
    request<void>(
      `/customers/${encodeURIComponent(customerId)}`,
      { method: "DELETE", body: JSON.stringify({ version }) },
      companyCsrfToken,
    ),
  listBookings: (customerId?: string, page = 1, status = "", pageSize = 20) =>
    request<BookingListResponse>(
      `/bookings${queryString({
        customerId,
        page: String(page),
        pageSize: String(pageSize),
        status,
      })}`,
    ),
  getBooking: (bookingId: string) =>
    request<Booking>(`/bookings/${encodeURIComponent(bookingId)}`),
  createBooking: (booking: BookingInput) =>
    request<BookingCreateResponse>(
      "/bookings",
      { method: "POST", body: JSON.stringify(booking) },
      companyCsrfToken,
    ),
  updateBooking: (booking: Booking) =>
    request<Booking>(
      `/bookings/${encodeURIComponent(booking._id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          checkinDate: booking.checkinDate,
          checkoutDate: booking.checkoutDate,
          roomIds: booking.rooms.map((room) => room.roomId),
          requestedRooms: booking.requestedRooms,
          guestCount: booking.guestCount,
          estimatedTotal: booking.estimatedTotal,
          status: booking.status,
          notes: booking.notes,
          terms: booking.termsSnapshot,
          version: booking.version,
        }),
      },
      companyCsrfToken,
    ),
  listBookingPayments: (bookingId: string) =>
    request<BookingPayment[]>(
      `/bookings/${encodeURIComponent(bookingId)}/payments`,
    ),
  recordBookingPayment: (bookingId: string, payment: BookingPaymentInput) =>
    request<BookingPayment>(
      `/bookings/${encodeURIComponent(bookingId)}/payments`,
      { method: "POST", body: JSON.stringify(payment) },
      companyCsrfToken,
    ),
  getBookingReceipt: (bookingId: string, paymentId: string) =>
    request<BookingReceipt>(
      `/bookings/${encodeURIComponent(bookingId)}/payments/${encodeURIComponent(paymentId)}/receipt`,
    ),
  sendBookingNotifications: (
    bookingId: string,
    input: {
      kind: "confirmation" | "advanceReceipt" | "cancellation";
      channels: Array<"email" | "whatsapp">;
      paymentId?: string;
      idempotencyKey?: string;
      allowResend?: boolean;
    },
  ) =>
    request<BookingNotificationResult>(
      `/bookings/${encodeURIComponent(bookingId)}/notifications`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          idempotencyKey: input.idempotencyKey || crypto.randomUUID(),
        }),
      },
      companyCsrfToken,
    ),
  createRoom: (room: RoomInput) =>
    request<Room>(
      "/rooms",
      { method: "POST", body: JSON.stringify(room) },
      companyCsrfToken,
    ),
  updateRoom: (
    roomId: string,
    room: Partial<RoomInput> & { isActive?: boolean; version: number },
  ) =>
    request<Room>(
      `/rooms/${encodeURIComponent(roomId)}`,
      { method: "PATCH", body: JSON.stringify(room) },
      companyCsrfToken,
    ),
  archiveRoom: (roomId: string) =>
    request<void>(
      `/rooms/${encodeURIComponent(roomId)}`,
      { method: "DELETE" },
      companyCsrfToken,
    ),
  async listRoomAllocations(roomId: string, page = 1) {
    const history = await request<RoomAllocationHistory | RoomAllocation[]>(
      `/rooms/${encodeURIComponent(roomId)}/allocations${queryString({ page: String(page) })}`,
    );
    if (isRoomAllocationHistory(history)) {
      return history;
    }
    if (Array.isArray(history)) {
      return normalizeLegacyRoomHistory(history, page);
    }
    throw new Error("Room history service returned an invalid response.");
  },
  getRoomBookingBoard: (from: string, to: string) =>
    request<RoomBookingBoard>(
      `/rooms/booking-board${queryString({ from, to })}`,
    ),
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
