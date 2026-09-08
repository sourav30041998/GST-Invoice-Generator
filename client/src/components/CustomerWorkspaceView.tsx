import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Download,
  Edit3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import type {
  Booking,
  BookingPayment,
  BookingPaymentMethod,
  BookingRoomRequest,
  BookingSummary,
  Customer,
  CustomerInput,
  CustomerSummary,
  Settings,
} from "../types";
import { downloadBookingReceipt } from "../utils/bookingReceiptPdf";
import { downloadStyledBookingSlip } from "../utils/styledBookingSlipPdf";
import { todayIso } from "../utils/dates";
import { StateCombobox } from "./StateCombobox";

type CustomerWorkspaceProps = {
  settings: Settings;
  showToast: (message: string) => void;
};

const CUSTOMER_BOOKINGS_PAGE_SIZE = 5;

type CustomerModalState = {
  mode: "create" | "edit";
  form: CustomerInput;
  showAdditional: boolean;
  customer?: Customer;
};

type CustomerFormError = {
  title: string;
  message: string;
  field?: "name" | "phone" | "email";
};

type BookingFormError = {
  title: string;
  message: string;
  field?:
    | "checkinDate"
    | "checkoutDate"
    | "guestCount"
    | "estimatedTotal"
    | "advanceAmount"
    | "requestedRooms";
};

type BookingRoomRequestForm = {
  id: string;
  roomType: string;
  bedsPerRoom: string;
  quantity: string;
};

type BookingFormState = {
  idempotencyKey: string;
  checkinDate: string;
  checkoutDate: string;
  requestedRooms: BookingRoomRequestForm[];
  guestCount: string;
  occupancyAuto: boolean;
  estimatedTotal: string;
  notes: string;
  terms: string;
  advanceAmount: string;
  method: BookingPaymentMethod;
  reference: string;
  sendEmail: boolean;
  sendWhatsApp: boolean;
};

type AccommodationDeleteState = {
  requestId: string;
  position: number;
  summary: string;
};

type PaymentModalState = {
  idempotencyKey: string;
  booking: BookingSummary;
  amount: string;
  method: BookingPaymentMethod;
  reference: string;
  notes: string;
  confirmBooking: boolean;
  sendEmail: boolean;
  sendWhatsApp: boolean;
};

type DeliveryConfirmationState = {
  booking: BookingSummary;
  channel: "email" | "whatsapp";
};

const EMPTY_CUSTOMER: CustomerInput = {
  name: "",
  phone: "",
  email: "",
  address: "",
  state: "",
  notes: "",
};

function validateCustomerInput(form: CustomerInput): CustomerFormError | null {
  const name = form.name.trim();
  if (!name) {
    return {
      title: "Customer name is missing",
      message: "Enter the customer's name before saving the record.",
      field: "name",
    };
  }
  if (name.length < 2) {
    return {
      title: "Customer name is too short",
      message: "The customer name must contain at least 2 characters.",
      field: "name",
    };
  }

  const phone = form.phone.trim();
  if (!phone) {
    return {
      title: "Phone number is missing",
      message: "Enter the customer's phone number before saving the record.",
      field: "phone",
    };
  }
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return {
      title: "Phone number format is invalid",
      message:
        "Enter a valid phone number with a country code, or a 10-digit Indian mobile number.",
      field: "phone",
    };
  }

  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      title: "Email address format is invalid",
      message: "Enter a complete email address, such as guest@example.com.",
      field: "email",
    };
  }
  return null;
}

function customerSaveError(error: unknown): CustomerFormError {
  const rawMessage =
    error instanceof Error ? error.message : "Customer could not be saved.";
  const pathMatch = rawMessage.match(/^(name|phone|email):\s*/i);
  const inferredField = pathMatch?.[1]?.toLowerCase() as
    CustomerFormError["field"] | undefined;
  const message = pathMatch
    ? rawMessage.slice(pathMatch[0].length)
    : rawMessage;
  const field =
    inferredField ||
    (/phone/i.test(message)
      ? "phone"
      : /email/i.test(message)
        ? "email"
        : undefined);
  return {
    title: "Customer could not be saved",
    message,
    field,
  };
}

function bookingSaveError(error: unknown): BookingFormError {
  const rawMessage =
    error instanceof Error ? error.message : "Booking could not be saved.";
  const pathMatch = rawMessage.match(
    /^(checkinDate|checkoutDate|guestCount|estimatedTotal|requestedRooms|initialPayment(?:\.amount)?):\s*/i,
  );
  const mappedField = pathMatch?.[1]?.toLowerCase();
  const field: BookingFormError["field"] =
    mappedField === "checkindate"
      ? "checkinDate"
      : mappedField === "checkoutdate"
        ? "checkoutDate"
        : mappedField === "guestcount"
          ? "guestCount"
          : mappedField === "estimatedtotal"
            ? "estimatedTotal"
            : mappedField === "requestedrooms"
              ? "requestedRooms"
              : mappedField?.startsWith("initialpayment")
                ? "advanceAmount"
                : /advance|payment amount/i.test(rawMessage)
                  ? "advanceAmount"
                  : undefined;
  return {
    title: "Booking could not be saved",
    message: pathMatch ? rawMessage.slice(pathMatch[0].length) : rawMessage,
    field,
  };
}

const DEFAULT_TERMS =
  "Cancellation received less than 48 hours before check-in is non-refundable. Date changes and refunds remain subject to the property's written approval and applicable law.";

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function blankRoomRequest(): BookingRoomRequestForm {
  return {
    id: crypto.randomUUID(),
    roomType: "",
    bedsPerRoom: "2",
    quantity: "1",
  };
}

function requestedCapacity(requests: BookingRoomRequestForm[]) {
  return requests.reduce(
    (total, request) =>
      total + Number(request.quantity || 0) * Number(request.bedsPerRoom || 0),
    0,
  );
}

function wholeNumberInput(value: string, maximumLength: number) {
  return value.replace(/\D/g, "").slice(0, maximumLength);
}

function moneyInput(value: string) {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  return decimalParts.length
    ? `${whole.slice(0, 10)}.${decimal}`
    : whole.slice(0, 10);
}

function roomRequestForm(
  requests: BookingRoomRequest[],
): BookingRoomRequestForm[] {
  return requests.length
    ? requests.map((request) => ({
        id: crypto.randomUUID(),
        roomType: request.roomType,
        bedsPerRoom: String(request.bedsPerRoom),
        quantity: String(request.quantity),
      }))
    : [blankRoomRequest()];
}

function blankBookingForm(
  settings: Settings,
  customer: Customer,
): BookingFormState {
  const checkinDate = todayIso();
  return {
    idempotencyKey: crypto.randomUUID(),
    checkinDate,
    checkoutDate: addDays(checkinDate, 1),
    requestedRooms: [blankRoomRequest()],
    guestCount: "2",
    occupancyAuto: true,
    estimatedTotal: "",
    notes: "",
    terms: settings.preset.terms?.trim() || DEFAULT_TERMS,
    advanceAmount: "",
    method: "upi",
    reference: "",
    sendEmail: Boolean(customer.email),
    sendWhatsApp: false,
  };
}

function bookingFormFromRecord(
  booking: Booking,
  customer: Customer,
): BookingFormState {
  const requestedRooms = roomRequestForm(booking.requestedRooms || []);
  return {
    idempotencyKey: crypto.randomUUID(),
    checkinDate: booking.checkinDate,
    checkoutDate: booking.checkoutDate,
    requestedRooms,
    guestCount: String(booking.guestCount),
    occupancyAuto: booking.guestCount === requestedCapacity(requestedRooms),
    estimatedTotal: booking.estimatedTotal
      ? String(booking.estimatedTotal)
      : "",
    notes: booking.notes,
    terms: booking.termsSnapshot,
    advanceAmount: "",
    method: "upi",
    reference: "",
    sendEmail: false,
    sendWhatsApp: false,
  };
}

function withRequestedRooms(
  form: BookingFormState,
  requestedRooms: BookingRoomRequestForm[],
): BookingFormState {
  const capacity = requestedCapacity(requestedRooms);
  return {
    ...form,
    requestedRooms,
    guestCount: form.occupancyAuto
      ? capacity > 0
        ? String(capacity)
        : ""
      : form.guestCount,
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

function bookingStatusLabel(status: Booking["status"]) {
  return {
    enquiry: "Enquiry",
    pendingAdvance: "Awaiting advance",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
  }[status];
}

function requestedRoomSummary(requests: BookingRoomRequest[]) {
  const summary = requests
    .map(
      (request) =>
        `${request.quantity} × ${request.bedsPerRoom}-bed${request.roomType ? ` ${request.roomType}` : ""} room${request.quantity === 1 ? "" : "s"}`,
    )
    .join(", ");
  return summary || "Not recorded";
}

function sentAtLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ModalShell({
  title,
  kicker,
  icon,
  children,
  onClose,
  busy,
  wide = false,
}: {
  title: string;
  kicker: string;
  icon: ReactNode;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
  wide?: boolean;
}) {
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const handleModalKeys = (event: KeyboardEvent) => {
      if (busyRef.current) {
        event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleModalKeys);
    window.requestAnimationFrame(() => {
      modalRef.current
        ?.querySelector<HTMLElement>(
          "input[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        )
        ?.focus();
    });
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleModalKeys);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="customer-modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        className={`customer-modal${wide ? " customer-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
      >
        <header className="customer-modal-header">
          <div className="customer-modal-heading">
            <span className="customer-modal-icon">{icon}</span>
            <div>
              <span>{kicker}</span>
              <h2>{title}</h2>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Close"
          >
            <X size={18} />
          </button>
        </header>
        {children}
        {busy ? (
          <div className="customer-operation-lock" aria-live="polite">
            <div className="orbit-loader" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <strong>Securing your changes...</strong>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BlockingFormErrorDialog({
  error,
  eyebrow,
  onClose,
}: {
  error: CustomerFormError | BookingFormError;
  eyebrow: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="customer-validation-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="customer-validation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="form-validation-title"
        aria-describedby="form-validation-message"
      >
        <header>
          <span aria-hidden="true">
            <AlertTriangle size={20} />
          </span>
          <div>
            <small>{eyebrow}</small>
            <h2 id="form-validation-title">{error.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Close"
            aria-label="Close error message"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <p id="form-validation-message">{error.message}</p>
        <footer>
          <button
            ref={closeButtonRef}
            className="btn btn-primary"
            type="button"
            onClick={onClose}
          >
            Close and review
          </button>
        </footer>
      </section>
    </div>
  );
}

function AccommodationDeleteDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: AccommodationDeleteState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  return (
    <div className="customer-validation-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="customer-validation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="accommodation-delete-title"
        aria-describedby="accommodation-delete-message"
      >
        <header>
          <span aria-hidden="true">
            <Trash2 size={19} />
          </span>
          <div>
            <small>Confirmation required</small>
            <h2 id="accommodation-delete-title">Remove accommodation?</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Cancel deletion"
            aria-label="Cancel accommodation deletion"
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </header>
        <p id="accommodation-delete-message">
          Are you sure you want to delete accommodation {request.position}:{" "}
          <strong>{request.summary}</strong>? Unsaved values in this row will be
          removed.
        </p>
        <footer className="customer-confirm-actions">
          <button
            ref={cancelButtonRef}
            className="btn btn-outline"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary danger-confirm-button"
            type="button"
            onClick={onConfirm}
          >
            <Trash2 size={15} />
            Delete
          </button>
        </footer>
      </section>
    </div>
  );
}

export function CustomerWorkspaceView({
  settings,
  showToast,
}: CustomerWorkspaceProps) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    totalItems: 0,
  });
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPages, setBookingPages] = useState(1);
  const [bookingSummary, setBookingSummary] = useState({
    total: 0,
    open: 0,
    confirmed: 0,
  });
  const [payments, setPayments] = useState<Record<string, BookingPayment[]>>(
    {},
  );
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [customerDetailLoadingId, setCustomerDetailLoadingId] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customerModal, setCustomerModal] = useState<CustomerModalState | null>(
    null,
  );
  const [customerFormError, setCustomerFormError] =
    useState<CustomerFormError | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingFormState | null>(null);
  const [bookingFormError, setBookingFormError] =
    useState<BookingFormError | null>(null);
  const [accommodationDelete, setAccommodationDelete] =
    useState<AccommodationDeleteState | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [paymentModal, setPaymentModal] = useState<PaymentModalState | null>(
    null,
  );
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [deliveryConfirmation, setDeliveryConfirmation] =
    useState<DeliveryConfirmationState | null>(null);
  const [notificationSendingKey, setNotificationSendingKey] = useState("");
  const notificationRetryKeys = useRef(new Map<string, string>());
  const notificationSendingRef = useRef(false);

  const loadCustomers = useCallback(
    async (page = 1, query = search) => {
      setLoadingCustomers(true);
      try {
        const response = await api.listCustomers(query, page);
        setCustomers(response.items);
        setPagination({
          page: response.pagination.page,
          totalPages: response.pagination.totalPages,
          totalItems: response.pagination.totalItems,
        });
        setSelectedCustomer((current) => {
          if (!current) return null;
          return response.items.some((item) => item._id === current._id)
            ? current
            : null;
        });
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : "Customers could not be loaded.",
        );
      } finally {
        setLoadingCustomers(false);
      }
    },
    [search, showToast],
  );

  const loadBookings = useCallback(
    async (customerId: string, page = 1) => {
      setLoadingBookings(true);
      try {
        const response = await api.listBookings(
          customerId,
          page,
          "",
          CUSTOMER_BOOKINGS_PAGE_SIZE,
        );
        setBookings(response.items);
        setBookingPage(response.pagination.page);
        setBookingPages(response.pagination.totalPages);
        setBookingSummary(response.summary);
      } catch (error) {
        setBookings([]);
        setBookingSummary({ total: 0, open: 0, confirmed: 0 });
        showToast(
          error instanceof Error
            ? error.message
            : "Bookings could not be loaded.",
        );
      } finally {
        setLoadingBookings(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCustomers(1, search), 280);
    return () => window.clearTimeout(timer);
  }, [loadCustomers, search]);

  useEffect(() => {
    void api
      .listIndianStates()
      .then(setStateOptions)
      .catch(() => setStateOptions([]));
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setBookings([]);
      setBookingSummary({ total: 0, open: 0, confirmed: 0 });
      return;
    }
    setExpandedBookingId("");
    setPayments({});
    void loadBookings(selectedCustomer._id, 1);
  }, [loadBookings, selectedCustomer?._id]);

  const selectCustomerSummary = async (customer: CustomerSummary) => {
    if (selectedCustomer?._id === customer._id) return;
    setCustomerDetailLoadingId(customer._id);
    try {
      const detail = await api.getCustomer(customer._id);
      setSelectedCustomer({
        ...detail,
        bookingCount: customer.bookingCount,
      });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Customer details could not be loaded.",
      );
    } finally {
      setCustomerDetailLoadingId("");
    }
  };

  const closeBookingForm = () => {
    setBookingFormError(null);
    setAccommodationDelete(null);
    setBookingForm(null);
    setEditingBooking(null);
  };

  const openNewBooking = () => {
    if (!selectedCustomer) return;
    setBookingFormError(null);
    setAccommodationDelete(null);
    setEditingBooking(null);
    setBookingForm(blankBookingForm(settings, selectedCustomer));
  };

  const openBookingEditor = async (booking: BookingSummary) => {
    if (!selectedCustomer) return;
    setBookingFormError(null);
    setAccommodationDelete(null);
    setBusy(true);
    try {
      const completeBooking = await api.getBooking(booking._id);
      setEditingBooking(completeBooking);
      setBookingForm(bookingFormFromRecord(completeBooking, selectedCustomer));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Booking could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateAccommodation = (
    requestId: string,
    field: "quantity" | "bedsPerRoom" | "roomType",
    value: string,
  ) => {
    setBookingForm((current) => {
      if (!current) return current;
      const normalizedValue =
        field === "quantity" || field === "bedsPerRoom"
          ? wholeNumberInput(value, 2)
          : value;
      const requestedRooms = current.requestedRooms.map((request) =>
        request.id === requestId
          ? { ...request, [field]: normalizedValue }
          : request,
      );
      return withRequestedRooms(current, requestedRooms);
    });
  };

  const addAccommodation = () => {
    setBookingForm((current) =>
      current
        ? withRequestedRooms(current, [
            ...current.requestedRooms,
            blankRoomRequest(),
          ])
        : current,
    );
  };

  const confirmAccommodationDelete = () => {
    if (!accommodationDelete) return;
    setBookingForm((current) => {
      if (!current || current.requestedRooms.length <= 1) return current;
      return withRequestedRooms(
        current,
        current.requestedRooms.filter(
          (request) => request.id !== accommodationDelete.requestId,
        ),
      );
    });
    setAccommodationDelete(null);
  };

  const openCancellation = async (booking: BookingSummary) => {
    setBusy(true);
    try {
      setCancelBooking(await api.getBooking(booking._id));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Booking could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  };

  const customerStats = useMemo(
    () => ({
      total: bookingSummary.total,
      open: bookingSummary.open,
      confirmed: bookingSummary.confirmed,
    }),
    [bookingSummary],
  );

  const dismissCustomerFormError = useCallback(() => {
    const field = customerFormError?.field;
    setCustomerFormError(null);
    if (field) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-customer-field="${field}"]`)
          ?.focus();
      });
    }
  }, [customerFormError?.field]);

  const dismissBookingFormError = useCallback(() => {
    const field = bookingFormError?.field;
    setBookingFormError(null);
    if (field) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-booking-field="${field}"]`)
          ?.focus();
      });
    }
  }, [bookingFormError?.field]);

  const closeCustomerModal = useCallback(() => {
    setCustomerFormError(null);
    setCustomerModal(null);
  }, []);

  const saveCustomer = async () => {
    if (!customerModal) return;
    const validationError = validateCustomerInput(customerModal.form);
    if (validationError) {
      setCustomerFormError(validationError);
      return;
    }
    setCustomerFormError(null);
    setBusy(true);
    try {
      const saved =
        customerModal.mode === "create"
          ? await api.createCustomer(customerModal.form)
          : await api.updateCustomer(
              customerModal.customer!._id,
              customerModal.form,
              customerModal.customer!.version,
            );
      closeCustomerModal();
      await loadCustomers(1, "");
      setSearch("");
      setSelectedCustomer(saved);
      showToast(
        customerModal.mode === "create"
          ? "Customer created."
          : "Customer details updated.",
      );
    } catch (error) {
      setCustomerFormError(customerSaveError(error));
    } finally {
      setBusy(false);
    }
  };

  const sendNotification = async (
    booking: BookingSummary,
    channels: Array<"email" | "whatsapp">,
    paymentId?: string,
    kind: "confirmation" | "advanceReceipt" | "cancellation" = "confirmation",
    announce = true,
    allowResend = false,
  ) => {
    if (!channels.length) return { message: "", succeeded: true };
    const operationKey = [
      booking._id,
      kind,
      paymentId || "",
      [...channels].sort().join(","),
    ].join(":");
    const idempotencyKey =
      notificationRetryKeys.current.get(operationKey) || crypto.randomUUID();
    notificationRetryKeys.current.set(operationKey, idempotencyKey);
    try {
      const response = await api.sendBookingNotifications(booking._id, {
        kind,
        channels,
        paymentId,
        idempotencyKey,
        allowResend,
      });
      notificationRetryKeys.current.delete(operationKey);
      const message = response.results
        .map((result) => result.message)
        .join(" ");
      if (announce) showToast(message);
      return {
        message,
        succeeded: response.results.every((result) => result.status === "sent"),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The notification could not be delivered.";
      if (announce) showToast(message);
      return { message, succeeded: false };
    }
  };

  const deliverBookingChannel = async (
    booking: BookingSummary,
    channel: "email" | "whatsapp",
    allowResend = false,
  ) => {
    const sendingKey = `${booking._id}:${channel}`;
    if (notificationSendingRef.current) return false;
    notificationSendingRef.current = true;
    setNotificationSendingKey(sendingKey);
    try {
      const outcome = await sendNotification(
        booking,
        [channel],
        undefined,
        "confirmation",
        true,
        allowResend,
      );
      if (outcome.succeeded) {
        const sentAt = new Date().toISOString();
        setBookings((current) =>
          current.map((item) =>
            item._id === booking._id
              ? {
                  ...item,
                  delivery: {
                    ...item.delivery,
                    ...(channel === "email"
                      ? { emailSentAt: sentAt }
                      : { whatsappSentAt: sentAt }),
                  },
                }
              : item,
          ),
        );
      }
      return outcome.succeeded;
    } finally {
      notificationSendingRef.current = false;
      setNotificationSendingKey("");
    }
  };

  const requestConfirmationDelivery = (
    booking: BookingSummary,
    channel: "email" | "whatsapp",
  ) => {
    setDeliveryConfirmation({ booking, channel });
  };

  const saveBooking = async () => {
    if (!bookingForm || !selectedCustomer) return;
    const estimatedTotal = Number(bookingForm.estimatedTotal || 0);
    const advanceAmount = Number(bookingForm.advanceAmount || 0);
    const guestCount = Number(bookingForm.guestCount);
    const requestedRooms = bookingForm.requestedRooms.map((request) => ({
      roomType: request.roomType.trim(),
      bedsPerRoom: Number(request.bedsPerRoom),
      quantity: Number(request.quantity),
    }));
    if (!bookingForm.checkinDate) {
      setBookingFormError({
        title: "Arrival date is missing",
        message:
          "Select the customer's arrival date before saving the booking.",
        field: "checkinDate",
      });
      return;
    }
    if (!bookingForm.checkoutDate) {
      setBookingFormError({
        title: "Departure date is missing",
        message:
          "Select the customer's departure date before saving the booking.",
        field: "checkoutDate",
      });
      return;
    }
    if (bookingForm.checkinDate >= bookingForm.checkoutDate) {
      setBookingFormError({
        title: "Stay dates are not valid",
        message: "Departure must be after the selected arrival date.",
        field: "checkoutDate",
      });
      return;
    }
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100) {
      setBookingFormError({
        title: "Expected occupancy is not valid",
        message:
          "Enter a whole number between 1 and 100 for expected occupancy.",
        field: "guestCount",
      });
      return;
    }
    if (!requestedRooms.length) {
      setBookingFormError({
        title: "Room request is missing",
        message: "Add at least one requested room combination.",
        field: "requestedRooms",
      });
      return;
    }
    if (
      requestedRooms.some(
        (request) =>
          !Number.isInteger(request.bedsPerRoom) ||
          request.bedsPerRoom < 1 ||
          request.bedsPerRoom > 50 ||
          !Number.isInteger(request.quantity) ||
          request.quantity < 1 ||
          request.quantity > 20,
      )
    ) {
      setBookingFormError({
        title: "Room request is not valid",
        message: "Each request needs 1 to 20 rooms and 1 to 50 beds per room.",
        field: "requestedRooms",
      });
      return;
    }
    const requestedRoomCount = requestedRooms.reduce(
      (total, request) => total + request.quantity,
      0,
    );
    if (requestedRoomCount > 20) {
      setBookingFormError({
        title: "Too many rooms requested",
        message: "A booking can request at most 20 rooms.",
        field: "requestedRooms",
      });
      return;
    }
    const requestedCapacity = requestedRooms.reduce(
      (total, request) => total + request.quantity * request.bedsPerRoom,
      0,
    );
    if (requestedCapacity < guestCount) {
      setBookingFormError({
        title: "Requested capacity is too small",
        message: `The accommodation plan has ${requestedCapacity} beds but expected occupancy is ${guestCount}.`,
        field: "requestedRooms",
      });
      return;
    }
    if (!Number.isFinite(estimatedTotal) || estimatedTotal < 0) {
      setBookingFormError({
        title: "Estimated total is not valid",
        message:
          "Enter zero or a valid positive amount for the estimated total.",
        field: "estimatedTotal",
      });
      return;
    }
    if (
      !editingBooking &&
      (!Number.isFinite(advanceAmount) || advanceAmount <= 0)
    ) {
      setBookingFormError({
        title: "Advance payment is required",
        message: "Record the advance received before confirming this booking.",
        field: "advanceAmount",
      });
      return;
    }
    if (
      !editingBooking &&
      estimatedTotal > 0 &&
      advanceAmount > estimatedTotal
    ) {
      setBookingFormError({
        title: "Advance exceeds the estimated total",
        message:
          "The advance received cannot be greater than the estimated booking total.",
        field: "advanceAmount",
      });
      return;
    }
    setBookingFormError(null);
    setBusy(true);
    try {
      let savedBooking: Booking;
      let paymentId: string | undefined;
      if (editingBooking) {
        savedBooking = await api.updateBooking({
          ...editingBooking,
          checkinDate: bookingForm.checkinDate,
          checkoutDate: bookingForm.checkoutDate,
          requestedRooms,
          guestCount,
          estimatedTotal,
          notes: bookingForm.notes,
          termsSnapshot: bookingForm.terms,
        });
      } else {
        const response = await api.createBooking({
          idempotencyKey: bookingForm.idempotencyKey,
          customerId: selectedCustomer._id,
          checkinDate: bookingForm.checkinDate,
          checkoutDate: bookingForm.checkoutDate,
          roomIds: [],
          requestedRooms,
          guestCount,
          estimatedTotal,
          status: "confirmed",
          notes: bookingForm.notes,
          terms: bookingForm.terms,
          initialPayment: {
            amount: advanceAmount,
            method: bookingForm.method,
            reference: bookingForm.reference,
            notes: "Initial booking advance",
            idempotencyKey: bookingForm.idempotencyKey,
          },
        });
        savedBooking = response.booking;
        paymentId = response.payment?._id;
      }
      const channels: Array<"email" | "whatsapp"> = [
        ...(bookingForm.sendEmail ? (["email"] as const) : []),
        ...(bookingForm.sendWhatsApp ? (["whatsapp"] as const) : []),
      ];
      const deliveryOutcome =
        savedBooking.status === "confirmed" && channels.length
          ? await sendNotification(
              savedBooking,
              [...channels],
              paymentId,
              "confirmation",
              false,
            )
          : { message: "", succeeded: true };
      closeBookingForm();
      await loadBookings(selectedCustomer._id, 1);
      await loadCustomers(pagination.page, search);
      showToast(
        `Booking ${savedBooking.confirmationNumber} saved.${deliveryOutcome.message ? ` ${deliveryOutcome.message}` : ""}`,
      );
    } catch (error) {
      setBookingFormError(bookingSaveError(error));
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async () => {
    if (!paymentModal || !selectedCustomer) return;
    const amount = Number(paymentModal.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid advance amount.");
      return;
    }
    setBusy(true);
    try {
      const payment = await api.recordBookingPayment(paymentModal.booking._id, {
        type: "advance",
        amount,
        method: paymentModal.method,
        reference: paymentModal.reference,
        notes: paymentModal.notes,
        idempotencyKey: paymentModal.idempotencyKey,
        confirmBooking: paymentModal.confirmBooking,
      });
      const refreshed = await api.getBooking(paymentModal.booking._id);
      const channels = [
        ...(paymentModal.sendEmail ? (["email"] as const) : []),
        ...(paymentModal.sendWhatsApp ? (["whatsapp"] as const) : []),
      ];
      const deliveryOutcome = channels.length
        ? await sendNotification(
            refreshed,
            [...channels],
            payment._id,
            paymentModal.confirmBooking ? "confirmation" : "advanceReceipt",
            false,
          )
        : { message: "", succeeded: true };
      setPaymentModal(null);
      await loadBookings(selectedCustomer._id, bookingPage);
      const nextPayments = await api.listBookingPayments(refreshed._id);
      setPayments((current) => ({ ...current, [refreshed._id]: nextPayments }));
      showToast(
        `Advance recorded as ${payment.receiptNumber}.${deliveryOutcome.message ? ` ${deliveryOutcome.message}` : ""}`,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Advance could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePaymentHistory = async (booking: BookingSummary) => {
    if (expandedBookingId === booking._id) {
      setExpandedBookingId("");
      return;
    }
    setExpandedBookingId(booking._id);
    if (payments[booking._id]) return;
    try {
      const records = await api.listBookingPayments(booking._id);
      setPayments((current) => ({ ...current, [booking._id]: records }));
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Payment history could not be loaded.",
      );
    }
  };

  const downloadReceipt = async (
    booking: BookingSummary,
    payment: BookingPayment,
    format: "modern" | "bookingSlip",
  ) => {
    setBusy(true);
    try {
      const receipt = await api.getBookingReceipt(booking._id, payment._id);
      if (format === "bookingSlip") {
        downloadStyledBookingSlip(receipt);
      } else {
        downloadBookingReceipt(receipt);
      }
      showToast(
        `${format === "bookingSlip" ? "Booking slip" : "Receipt"} ${payment.receiptNumber} downloaded.`,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Receipt could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmCancellation = async () => {
    if (!cancelBooking || !selectedCustomer) return;
    setBusy(true);
    try {
      const updated = await api.updateBooking({
        ...cancelBooking,
        status: "cancelled",
      });
      const deliveryOutcome = selectedCustomer.email
        ? await sendNotification(
            updated,
            ["email"],
            undefined,
            "cancellation",
            false,
          )
        : { message: "", succeeded: true };
      setCancelBooking(null);
      await loadBookings(selectedCustomer._id, bookingPage);
      showToast(
        `${updated.confirmationNumber} cancelled.${deliveryOutcome.message ? ` ${deliveryOutcome.message}` : ""}`,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Booking could not be cancelled.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="customer-workspace">
      <section className="customer-command-band">
        <div>
          <span className="customer-kicker">Guest relationships</span>
          <h2>
            {selectedCustomer ? "Customer Profile" : "Customer Directory"}
          </h2>
          <p>
            {selectedCustomer
              ? "Manage this guest's details, bookings, advances, and receipts."
              : "Find a guest, then open their complete customer and booking record."}
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            setCustomerFormError(null);
            setCustomerModal({
              mode: "create",
              form: { ...EMPTY_CUSTOMER },
              showAdditional: false,
            });
          }}
        >
          <Plus size={16} />
          New customer
        </button>
      </section>

      {selectedCustomer ? (
        <section className="customer-metrics" aria-label="Customer overview">
          <div>
            <ReceiptText size={18} />
            <span>Total bookings</span>
            <strong>{customerStats.total}</strong>
          </div>
          <div>
            <CalendarDays size={18} />
            <span>Open bookings</span>
            <strong>{customerStats.open}</strong>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>Confirmed stays</span>
            <strong>{customerStats.confirmed}</strong>
          </div>
        </section>
      ) : null}

      <div
        className={`customer-desk-layout ${selectedCustomer ? "profile-view" : "directory-view"}`}
      >
        <aside className="customer-directory-panel">
          <div className="customer-directory-toolbar">
            <div>
              <span>Directory</span>
              <strong>{pagination.totalItems} customers</strong>
            </div>
            <label className="customer-search-box">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone or email"
                aria-label="Search customers"
              />
            </label>
          </div>
          <div className="customer-directory-columns" aria-hidden="true">
            <span>Customer</span>
            <span>Contact</span>
            <span>Bookings</span>
            <span>Status</span>
            <span />
          </div>
          <div className="customer-directory-list">
            {loadingCustomers ? (
              <div className="customer-list-loading">
                <div className="orbit-loader">
                  <i />
                  <i />
                  <i />
                </div>
                <span>Opening directory...</span>
              </div>
            ) : customers.length ? (
              customers.map((customer) => (
                <button
                  type="button"
                  key={customer._id}
                  className={`customer-directory-row${selectedCustomer?._id === customer._id ? " active" : ""}`}
                  disabled={customerDetailLoadingId === customer._id}
                  onClick={() => void selectCustomerSummary(customer)}
                >
                  <span className="customer-avatar">
                    {customer.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="customer-directory-identity">
                    <strong>{customer.name}</strong>
                  </span>
                  <span className="customer-directory-contact">
                    <small>Phone</small>
                    <strong>
                      {customerDetailLoadingId === customer._id
                        ? "Loading customer details..."
                        : customer.phoneMasked}
                    </strong>
                  </span>
                  <span className="customer-directory-bookings">
                    <small>Bookings</small>
                    <strong>{customer.bookingCount || 0}</strong>
                  </span>
                  <span
                    className={`customer-directory-status ${customer.status}`}
                  >
                    {customer.status}
                  </span>
                  <span className="customer-directory-open" aria-hidden="true">
                    <ChevronRight size={17} />
                  </span>
                  <span className="customer-directory-mobile-contact">
                    <small>
                      {customerDetailLoadingId === customer._id
                        ? "Loading customer details..."
                        : customer.phoneMasked}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <div className="customer-empty-directory">
                <UserRound size={25} />
                <strong>No customers found</strong>
                <span>Create the first customer or change the search.</span>
              </div>
            )}
          </div>
          <div className="customer-pagination">
            <button
              type="button"
              className="icon-button"
              disabled={pagination.page <= 1}
              onClick={() => void loadCustomers(pagination.page - 1)}
              title="Previous page"
            >
              <ArrowLeft size={15} />
            </button>
            <span>
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              className="icon-button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => void loadCustomers(pagination.page + 1)}
              title="Next page"
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </aside>

        <section className="customer-profile-panel">
          {selectedCustomer ? (
            <div className="customer-profile-navigation">
              <button
                className="btn btn-text"
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setBookings([]);
                  setBookingSummary({ total: 0, open: 0, confirmed: 0 });
                  setExpandedBookingId("");
                  setPayments({});
                  window.requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>(".customer-search-box input")
                      ?.focus(),
                  );
                }}
              >
                <ArrowLeft size={15} />
                Back to customers
              </button>
              <span>Customer directory / {selectedCustomer.name}</span>
            </div>
          ) : null}
          {selectedCustomer ? (
            <>
              <header className="customer-profile-header">
                <div className="customer-profile-identity">
                  <span>{selectedCustomer.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <p>Customer profile</p>
                    <h3>{selectedCustomer.name}</h3>
                  </div>
                </div>
                <div className="customer-profile-actions">
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => {
                      setCustomerFormError(null);
                      setCustomerModal({
                        mode: "edit",
                        customer: selectedCustomer,
                        showAdditional: Boolean(
                          selectedCustomer.address ||
                          selectedCustomer.state ||
                          selectedCustomer.notes,
                        ),
                        form: {
                          name: selectedCustomer.name,
                          phone: selectedCustomer.phone,
                          email: selectedCustomer.email,
                          address: selectedCustomer.address,
                          state: selectedCustomer.state,
                          notes: selectedCustomer.notes,
                        },
                      });
                    }}
                  >
                    <Edit3 size={15} />
                    Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={openNewBooking}
                  >
                    <Plus size={15} />
                    New booking
                  </button>
                </div>
              </header>
              <div className="customer-contact-strip">
                <span>
                  <Phone size={14} />
                  <small>Phone</small>
                  <strong>{selectedCustomer.phone}</strong>
                </span>
                <span>
                  <Mail size={14} />
                  <small>Email</small>
                  <strong>{selectedCustomer.email || "Not recorded"}</strong>
                </span>
                <span>
                  <CalendarDays size={14} />
                  <small>Bookings</small>
                  <strong>
                    {selectedCustomer.bookingCount || bookings.length}
                  </strong>
                </span>
              </div>

              <div className="customer-booking-heading">
                <div>
                  <span>Stay activity</span>
                  <h3>Bookings & advances</h3>
                </div>
              </div>
              <div className="customer-booking-list">
                {loadingBookings ? (
                  <div className="booking-list-loading">
                    <div className="orbit-loader">
                      <i />
                      <i />
                      <i />
                    </div>
                    <strong>Reading booking ledger...</strong>
                  </div>
                ) : bookings.length ? (
                  bookings.map((booking) => (
                    <article
                      className="customer-booking-card"
                      key={booking._id}
                    >
                      <header>
                        <div className="booking-card-identity">
                          <div>
                            <span
                              className={`booking-status ${booking.status}`}
                            >
                              {bookingStatusLabel(booking.status)}
                            </span>
                            <strong>{booking.confirmationNumber}</strong>
                          </div>
                          {booking.delivery.emailSentAt ||
                          booking.delivery.whatsappSentAt ? (
                            <div className="booking-delivery-marks">
                              {booking.delivery.emailSentAt ? (
                                <span
                                  title={`Email sent ${sentAtLabel(booking.delivery.emailSentAt)}`}
                                >
                                  <Mail size={12} />
                                  Email sent
                                </span>
                              ) : null}
                              {booking.delivery.whatsappSentAt ? (
                                <span
                                  title={`WhatsApp sent ${sentAtLabel(booking.delivery.whatsappSentAt)}`}
                                >
                                  <MessageCircle size={12} />
                                  WhatsApp sent
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="booking-card-actions">
                          {booking.status === "confirmed" ? (
                            <button
                              type="button"
                              className="icon-button"
                              title={
                                booking.delivery.emailSentAt
                                  ? `Email sent ${sentAtLabel(booking.delivery.emailSentAt)}. Resend confirmation`
                                  : "Email confirmation"
                              }
                              disabled={
                                !selectedCustomer.email ||
                                Boolean(notificationSendingKey)
                              }
                              onClick={() =>
                                requestConfirmationDelivery(booking, "email")
                              }
                            >
                              <Mail size={15} />
                            </button>
                          ) : null}
                          {booking.status === "confirmed" ? (
                            <button
                              type="button"
                              className="icon-button"
                              title={
                                selectedCustomer.whatsappOptIn
                                  ? booking.delivery.whatsappSentAt
                                    ? `WhatsApp sent ${sentAtLabel(booking.delivery.whatsappSentAt)}. Resend confirmation`
                                    : "WhatsApp confirmation"
                                  : "WhatsApp consent is not recorded"
                              }
                              disabled={
                                !selectedCustomer.whatsappOptIn ||
                                Boolean(notificationSendingKey)
                              }
                              onClick={() =>
                                requestConfirmationDelivery(booking, "whatsapp")
                              }
                            >
                              <MessageCircle size={15} />
                            </button>
                          ) : null}
                          {!booking.invoiceId &&
                          !["cancelled", "completed"].includes(
                            booking.status,
                          ) ? (
                            <button
                              type="button"
                              className="icon-button"
                              title="Edit stay details"
                              onClick={() => void openBookingEditor(booking)}
                            >
                              <Edit3 size={15} />
                            </button>
                          ) : null}
                          {!booking.invoiceId &&
                          !["cancelled", "completed"].includes(
                            booking.status,
                          ) ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-compact"
                              onClick={() =>
                                setPaymentModal({
                                  idempotencyKey: crypto.randomUUID(),
                                  booking,
                                  amount: "",
                                  method: "upi",
                                  reference: "",
                                  notes: "",
                                  confirmBooking:
                                    booking.status !== "confirmed",
                                  sendEmail: Boolean(selectedCustomer.email),
                                  sendWhatsApp: false,
                                })
                              }
                            >
                              <CircleDollarSign size={14} />
                              Add advance
                            </button>
                          ) : null}
                          {!booking.invoiceId &&
                          !["cancelled", "completed"].includes(
                            booking.status,
                          ) ? (
                            <button
                              type="button"
                              className="btn btn-text danger-text"
                              onClick={() => void openCancellation(booking)}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </header>
                      <div className="booking-facts">
                        <span>
                          <small>Stay</small>
                          <strong>
                            {booking.checkinDate} to {booking.checkoutDate}
                          </strong>
                        </span>
                        <span>
                          <small>Expected occupancy</small>
                          <strong>{booking.guestCount}</strong>
                        </span>
                        <span>
                          <small>Estimated</small>
                          <strong>{money(booking.estimatedTotal)}</strong>
                        </span>
                        <span>
                          <small>Advance</small>
                          <strong className="advance-value">
                            {money(booking.advanceReceived)}
                          </strong>
                        </span>
                      </div>
                      <div className="booking-room-request-summary">
                        <BedDouble size={14} />
                        <span>Requested</span>
                        <strong>
                          {requestedRoomSummary(booking.requestedRooms)}
                        </strong>
                      </div>
                      {booking.invoiceNumber ? (
                        <div className="booking-invoice-link">
                          <ReceiptText size={14} />
                          Linked invoice{" "}
                          <strong>{booking.invoiceNumber}</strong>
                        </div>
                      ) : null}
                      <button
                        className={`booking-payment-toggle${expandedBookingId === booking._id ? " expanded" : ""}`}
                        type="button"
                        aria-expanded={expandedBookingId === booking._id}
                        aria-controls={`booking-payments-${booking._id}`}
                        onClick={() => void togglePaymentHistory(booking)}
                      >
                        <span className="booking-payment-toggle-label">
                          <span aria-hidden="true">
                            <ReceiptText size={17} />
                          </span>
                          <span>
                            <strong>Advance payment receipts</strong>
                            <small>View and download receipt history</small>
                          </span>
                        </span>
                        <span className="booking-payment-toggle-action">
                          <strong>{money(booking.advanceReceived)}</strong>
                          <span aria-hidden="true">
                            {expandedBookingId === booking._id ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </span>
                        </span>
                      </button>
                      {expandedBookingId === booking._id ? (
                        <div
                          className="booking-payment-ledger"
                          id={`booking-payments-${booking._id}`}
                        >
                          {payments[booking._id]?.length ? (
                            payments[booking._id].map((payment) => (
                              <div key={payment._id}>
                                <span>
                                  <ReceiptText size={14} />
                                  <strong>{payment.receiptNumber}</strong>
                                  <small>
                                    {new Date(
                                      payment.receivedAt,
                                    ).toLocaleDateString("en-IN")}{" "}
                                    - {payment.method}
                                  </small>
                                </span>
                                <strong>
                                  {payment.type === "refund" ? "-" : "+"}
                                  {money(payment.amount)}
                                </strong>
                                <button
                                  type="button"
                                  className="icon-button"
                                  title="Download modern receipt"
                                  onClick={() =>
                                    void downloadReceipt(
                                      booking,
                                      payment,
                                      "modern",
                                    )
                                  }
                                >
                                  <Download size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button"
                                  title="Download booking slip"
                                  onClick={() =>
                                    void downloadReceipt(
                                      booking,
                                      payment,
                                      "bookingSlip",
                                    )
                                  }
                                >
                                  <FileText size={15} />
                                </button>
                              </div>
                            ))
                          ) : (
                            <p>No payments recorded for this booking.</p>
                          )}
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="customer-booking-empty">
                    <BedDouble size={25} />
                    <strong>No booking activity yet</strong>
                    <span>Create a booking after receiving an advance.</span>
                  </div>
                )}
              </div>
              {bookingPages > 1 ? (
                <div className="booking-pagination">
                  <button
                    className="btn btn-outline btn-compact"
                    type="button"
                    disabled={bookingPage <= 1}
                    onClick={() =>
                      void loadBookings(selectedCustomer._id, bookingPage - 1)
                    }
                  >
                    <ArrowLeft size={14} />
                    Previous
                  </button>
                  <span>
                    Page {bookingPage} of {bookingPages}
                  </span>
                  <button
                    className="btn btn-outline btn-compact"
                    type="button"
                    disabled={bookingPage >= bookingPages}
                    onClick={() =>
                      void loadBookings(selectedCustomer._id, bookingPage + 1)
                    }
                  >
                    Next
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="customer-profile-empty">
              <UsersRound size={34} />
              <h3>Select a customer</h3>
              <p>
                Customer contact, bookings, advances, and receipts will appear
                here.
              </p>
            </div>
          )}
        </section>
      </div>

      {customerModal ? (
        <ModalShell
          title={
            customerModal.mode === "create" ? "Add a customer" : "Edit customer"
          }
          kicker="Customer contact"
          icon={<UserRound size={19} />}
          busy={busy}
          onClose={closeCustomerModal}
        >
          <div className="customer-modal-body customer-form-grid">
            <label className="field">
              <span>Name *</span>
              <input
                className="input"
                autoFocus
                data-customer-field="name"
                value={customerModal.form.name}
                maxLength={160}
                onChange={(event) =>
                  setCustomerModal((current) =>
                    current
                      ? {
                          ...current,
                          form: { ...current.form, name: event.target.value },
                        }
                      : current,
                  )
                }
              />
            </label>
            <label className="field">
              <span>Phone number *</span>
              <input
                className="input"
                type="tel"
                data-customer-field="phone"
                value={customerModal.form.phone}
                maxLength={24}
                placeholder="+91 98765 43210"
                onChange={(event) =>
                  setCustomerModal((current) =>
                    current
                      ? {
                          ...current,
                          form: { ...current.form, phone: event.target.value },
                        }
                      : current,
                  )
                }
              />
            </label>
            <label className="field full">
              <span>Email</span>
              <input
                className="input"
                type="email"
                data-customer-field="email"
                value={customerModal.form.email}
                maxLength={254}
                onChange={(event) =>
                  setCustomerModal((current) =>
                    current
                      ? {
                          ...current,
                          form: { ...current.form, email: event.target.value },
                        }
                      : current,
                  )
                }
              />
            </label>
            <button
              className="customer-optional-toggle full"
              type="button"
              aria-expanded={customerModal.showAdditional}
              onClick={() =>
                setCustomerModal((current) =>
                  current
                    ? { ...current, showAdditional: !current.showAdditional }
                    : current,
                )
              }
            >
              <span>
                <strong>Additional details</strong>
                <small>Optional state, address, and internal note</small>
              </span>
              {customerModal.showAdditional ? (
                <ChevronUp size={17} />
              ) : (
                <ChevronDown size={17} />
              )}
            </button>
            {customerModal.showAdditional ? (
              <>
                <div className="field">
                  <span>State</span>
                  <StateCombobox
                    value={customerModal.form.state}
                    onChange={(value) =>
                      setCustomerModal((current) =>
                        current
                          ? {
                              ...current,
                              form: { ...current.form, state: value },
                            }
                          : current,
                      )
                    }
                    states={stateOptions}
                  />
                </div>
                <div className="field">
                  <span>Address</span>
                  <textarea
                    className="input"
                    value={customerModal.form.address}
                    maxLength={500}
                    onChange={(event) =>
                      setCustomerModal((current) =>
                        current
                          ? {
                              ...current,
                              form: {
                                ...current.form,
                                address: event.target.value,
                              },
                            }
                          : current,
                      )
                    }
                  />
                </div>
                <label className="field full">
                  <span>Internal note</span>
                  <textarea
                    className="input"
                    value={customerModal.form.notes}
                    maxLength={1000}
                    onChange={(event) =>
                      setCustomerModal((current) =>
                        current
                          ? {
                              ...current,
                              form: {
                                ...current.form,
                                notes: event.target.value,
                              },
                            }
                          : current,
                      )
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
          <footer className="customer-modal-actions">
            <button
              className="btn btn-outline"
              type="button"
              disabled={busy}
              onClick={closeCustomerModal}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void saveCustomer()}
            >
              <Check size={16} />
              Save customer
            </button>
          </footer>
        </ModalShell>
      ) : null}

      {customerFormError ? (
        <BlockingFormErrorDialog
          error={customerFormError}
          eyebrow="Customer not saved"
          onClose={dismissCustomerFormError}
        />
      ) : null}

      {bookingForm && selectedCustomer ? (
        <ModalShell
          title={editingBooking ? "Edit booking" : "Create a booking"}
          kicker={editingBooking?.confirmationNumber || selectedCustomer.name}
          icon={<CalendarDays size={19} />}
          busy={busy}
          wide
          onClose={closeBookingForm}
        >
          <div className="customer-modal-body booking-form-layout">
            <div className="booking-form-main">
              <div className="customer-form-grid">
                <label className="field">
                  <span>Arrival *</span>
                  <input
                    className="input"
                    type="date"
                    autoFocus
                    data-booking-field="checkinDate"
                    value={bookingForm.checkinDate}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        checkinDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Departure *</span>
                  <input
                    className="input"
                    type="date"
                    min={bookingForm.checkinDate}
                    data-booking-field="checkoutDate"
                    value={bookingForm.checkoutDate}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        checkoutDate: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="field">
                  <span className="booking-field-heading">
                    Expected occupancy *
                    <button
                      type="button"
                      className={`occupancy-sync-button${bookingForm.occupancyAuto ? " active" : ""}`}
                      title="Use accommodation capacity"
                      onClick={(event) => {
                        event.preventDefault();
                        const capacity = requestedCapacity(
                          bookingForm.requestedRooms,
                        );
                        setBookingForm({
                          ...bookingForm,
                          guestCount: capacity > 0 ? String(capacity) : "",
                          occupancyAuto: true,
                        });
                      }}
                    >
                      <RefreshCw size={11} />
                      {bookingForm.occupancyAuto ? "Auto" : "Use calculated"}
                    </button>
                  </span>
                  <input
                    className="input"
                    aria-label="Expected occupancy"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    data-booking-field="guestCount"
                    value={bookingForm.guestCount}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        guestCount: wholeNumberInput(event.target.value, 3),
                        occupancyAuto: false,
                      })
                    }
                  />
                </div>
                <label className="field">
                  <span>Estimated total</span>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    data-booking-field="estimatedTotal"
                    value={bookingForm.estimatedTotal}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        estimatedTotal: moneyInput(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <section
                className="booking-request-builder"
                data-booking-field="requestedRooms"
                tabIndex={-1}
              >
                <header>
                  <div>
                    <span>Requested rooms *</span>
                    <strong>Accommodation plan</strong>
                  </div>
                  <small>
                    {bookingForm.requestedRooms.reduce(
                      (total, request) => total + Number(request.quantity || 0),
                      0,
                    )}{" "}
                    rooms ·{" "}
                    {bookingForm.requestedRooms.reduce(
                      (total, request) =>
                        total +
                        Number(request.quantity || 0) *
                          Number(request.bedsPerRoom || 0),
                      0,
                    )}{" "}
                    beds
                  </small>
                </header>
                <div className="booking-request-list">
                  {bookingForm.requestedRooms.map((request, index) => (
                    <div className="booking-request-row" key={request.id}>
                      <label>
                        <span>Rooms</span>
                        <input
                          className="input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={request.quantity}
                          onChange={(event) =>
                            updateAccommodation(
                              request.id,
                              "quantity",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Beds each</span>
                        <input
                          className="input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={request.bedsPerRoom}
                          onChange={(event) =>
                            updateAccommodation(
                              request.id,
                              "bedsPerRoom",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Preference</span>
                        <input
                          className="input"
                          maxLength={80}
                          value={request.roomType}
                          placeholder="Any room type"
                          onChange={(event) =>
                            updateAccommodation(
                              request.id,
                              "roomType",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <button
                        className="icon-button danger-text"
                        type="button"
                        title={`Remove room combination ${index + 1}`}
                        aria-label={`Remove room combination ${index + 1}`}
                        disabled={bookingForm.requestedRooms.length === 1}
                        onClick={() =>
                          setAccommodationDelete({
                            requestId: request.id,
                            position: index + 1,
                            summary: `${request.quantity || "0"} room${request.quantity === "1" ? "" : "s"}, ${request.bedsPerRoom || "0"} beds each${request.roomType.trim() ? `, ${request.roomType.trim()}` : ""}`,
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-text booking-request-add"
                  type="button"
                  disabled={bookingForm.requestedRooms.length >= 12}
                  onClick={addAccommodation}
                >
                  <Plus size={14} />
                  Add combination
                </button>
              </section>
            </div>
            <aside className="booking-form-side">
              {editingBooking ? (
                <div className="booking-advance-box booking-balance-box">
                  <span>Recorded advance</span>
                  <strong>{money(editingBooking.advanceReceived)}</strong>
                  <small>
                    Use Add advance on the booking card to issue another
                    receipt.
                  </small>
                </div>
              ) : (
                <div className="booking-advance-box">
                  <span>Advance payment *</span>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    data-booking-field="advanceAmount"
                    value={bookingForm.advanceAmount}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        advanceAmount: moneyInput(event.target.value),
                      })
                    }
                    placeholder="0.00"
                  />
                  <select
                    className="input"
                    value={bookingForm.method}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        method: event.target.value as BookingPaymentMethod,
                      })
                    }
                  >
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bankTransfer">Bank transfer</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    className="input"
                    value={bookingForm.reference}
                    maxLength={160}
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        reference: event.target.value,
                      })
                    }
                    placeholder="Transaction reference"
                  />
                </div>
              )}
              {!editingBooking ? (
                <div className="booking-delivery-options">
                  <span>Issue receipt</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={bookingForm.sendEmail}
                      disabled={!selectedCustomer.email}
                      onChange={(event) =>
                        setBookingForm({
                          ...bookingForm,
                          sendEmail: event.target.checked,
                        })
                      }
                    />
                    <Mail size={14} />
                    Email PDF receipt
                  </label>
                  <label
                    title={
                      selectedCustomer.whatsappOptIn
                        ? ""
                        : "Record customer consent first"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={bookingForm.sendWhatsApp}
                      disabled={!selectedCustomer.whatsappOptIn}
                      onChange={(event) =>
                        setBookingForm({
                          ...bookingForm,
                          sendWhatsApp: event.target.checked,
                        })
                      }
                    />
                    <MessageCircle size={14} />
                    WhatsApp receipt
                  </label>
                  {!selectedCustomer.email ? (
                    <small>
                      Add an email to the customer profile to send it.
                    </small>
                  ) : null}
                  {!selectedCustomer.whatsappOptIn ? (
                    <small>WhatsApp requires recorded customer consent.</small>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
          <footer className="customer-modal-actions">
            <button
              className="btn btn-outline"
              type="button"
              disabled={busy}
              onClick={closeBookingForm}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void saveBooking()}
            >
              <Check size={16} />
              {editingBooking ? "Save changes" : "Save booking"}
            </button>
          </footer>
        </ModalShell>
      ) : null}

      {accommodationDelete ? (
        <AccommodationDeleteDialog
          request={accommodationDelete}
          onCancel={() => setAccommodationDelete(null)}
          onConfirm={confirmAccommodationDelete}
        />
      ) : null}

      {bookingFormError ? (
        <BlockingFormErrorDialog
          error={bookingFormError}
          eyebrow="Booking not saved"
          onClose={dismissBookingFormError}
        />
      ) : null}

      {deliveryConfirmation ? (
        <ModalShell
          title={`${
            (
              deliveryConfirmation.channel === "email"
                ? deliveryConfirmation.booking.delivery.emailSentAt
                : deliveryConfirmation.booking.delivery.whatsappSentAt
            )
              ? "Resend"
              : "Send"
          } ${deliveryConfirmation.channel === "email" ? "email" : "WhatsApp"} confirmation?`}
          kicker={deliveryConfirmation.booking.confirmationNumber}
          icon={
            deliveryConfirmation.channel === "email" ? (
              <Mail size={19} />
            ) : (
              <MessageCircle size={19} />
            )
          }
          busy={Boolean(notificationSendingKey)}
          onClose={() => setDeliveryConfirmation(null)}
        >
          <div className="customer-modal-body resend-confirmation-copy">
            <p>
              {(
                deliveryConfirmation.channel === "email"
                  ? deliveryConfirmation.booking.delivery.emailSentAt
                  : deliveryConfirmation.booking.delivery.whatsappSentAt
              ) ? (
                <>
                  This confirmation was sent on{" "}
                  <strong>
                    {sentAtLabel(
                      deliveryConfirmation.channel === "email"
                        ? deliveryConfirmation.booking.delivery.emailSentAt!
                        : deliveryConfirmation.booking.delivery.whatsappSentAt!,
                    )}
                  </strong>
                  . Send another copy to the customer?
                </>
              ) : (
                <>
                  Send this booking confirmation to the customer&apos;s
                  registered{" "}
                  <strong>
                    {deliveryConfirmation.channel === "email"
                      ? "email address"
                      : "WhatsApp number"}
                  </strong>
                  ? Nothing will be sent until you confirm below.
                </>
              )}
            </p>
          </div>
          <footer className="customer-modal-actions">
            <button
              className="btn btn-outline"
              type="button"
              disabled={Boolean(notificationSendingKey)}
              onClick={() => setDeliveryConfirmation(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={Boolean(notificationSendingKey)}
              onClick={() => {
                const request = deliveryConfirmation;
                const wasPreviouslySent = Boolean(
                  request.channel === "email"
                    ? request.booking.delivery.emailSentAt
                    : request.booking.delivery.whatsappSentAt,
                );
                void deliverBookingChannel(
                  request.booking,
                  request.channel,
                  wasPreviouslySent,
                ).then((succeeded) => {
                  if (succeeded) setDeliveryConfirmation(null);
                });
              }}
            >
              {deliveryConfirmation.channel === "email" ? (
                <Mail size={16} />
              ) : (
                <MessageCircle size={16} />
              )}
              {(
                deliveryConfirmation.channel === "email"
                  ? deliveryConfirmation.booking.delivery.emailSentAt
                  : deliveryConfirmation.booking.delivery.whatsappSentAt
              )
                ? "Resend confirmation"
                : "Send confirmation"}
            </button>
          </footer>
        </ModalShell>
      ) : null}

      {paymentModal ? (
        <ModalShell
          title="Record an advance"
          kicker={paymentModal.booking.confirmationNumber}
          icon={<CircleDollarSign size={19} />}
          busy={busy}
          onClose={() => setPaymentModal(null)}
        >
          <div className="customer-modal-body customer-form-grid">
            <label className="field">
              <span>Amount *</span>
              <input
                className="input"
                autoFocus
                type="number"
                min="0.01"
                step="0.01"
                value={paymentModal.amount}
                onChange={(event) =>
                  setPaymentModal({
                    ...paymentModal,
                    amount: event.target.value,
                  })
                }
              />
            </label>
            <label className="field">
              <span>Method *</span>
              <select
                className="input"
                value={paymentModal.method}
                onChange={(event) =>
                  setPaymentModal({
                    ...paymentModal,
                    method: event.target.value as BookingPaymentMethod,
                  })
                }
              >
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bankTransfer">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field full">
              <span>Transaction reference</span>
              <input
                className="input"
                maxLength={160}
                value={paymentModal.reference}
                onChange={(event) =>
                  setPaymentModal({
                    ...paymentModal,
                    reference: event.target.value,
                  })
                }
              />
            </label>
            <label className="field full">
              <span>Internal note</span>
              <textarea
                className="input"
                maxLength={500}
                value={paymentModal.notes}
                onChange={(event) =>
                  setPaymentModal({
                    ...paymentModal,
                    notes: event.target.value,
                  })
                }
              />
            </label>
            {paymentModal.booking.status !== "confirmed" ? (
              <label className="customer-check-row full">
                <input
                  type="checkbox"
                  checked={paymentModal.confirmBooking}
                  onChange={(event) =>
                    setPaymentModal({
                      ...paymentModal,
                      confirmBooking: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Confirm booking after payment</strong>
                  <small>
                    Room allocation will be completed during invoicing.
                  </small>
                </span>
              </label>
            ) : null}
            <div className="booking-delivery-options full">
              <span>Send receipt and confirmation</span>
              <label>
                <input
                  type="checkbox"
                  checked={paymentModal.sendEmail}
                  disabled={!selectedCustomer?.email}
                  onChange={(event) =>
                    setPaymentModal({
                      ...paymentModal,
                      sendEmail: event.target.checked,
                    })
                  }
                />
                <Mail size={14} />
                Email
              </label>
              <label
                title={
                  selectedCustomer?.whatsappOptIn
                    ? ""
                    : "Record customer consent first"
                }
              >
                <input
                  type="checkbox"
                  checked={paymentModal.sendWhatsApp}
                  disabled={!selectedCustomer?.whatsappOptIn}
                  onChange={(event) =>
                    setPaymentModal({
                      ...paymentModal,
                      sendWhatsApp: event.target.checked,
                    })
                  }
                />
                <MessageCircle size={14} />
                WhatsApp
              </label>
            </div>
          </div>
          <footer className="customer-modal-actions">
            <button
              className="btn btn-outline"
              type="button"
              disabled={busy}
              onClick={() => setPaymentModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void savePayment()}
            >
              <ReceiptText size={16} />
              Record & issue receipt
            </button>
          </footer>
        </ModalShell>
      ) : null}

      {cancelBooking ? (
        <ModalShell
          title="Cancel this booking?"
          kicker={cancelBooking.confirmationNumber}
          icon={<CalendarDays size={19} />}
          busy={busy}
          onClose={() => setCancelBooking(null)}
        >
          <div className="customer-modal-body cancellation-copy">
            <p>
              The room hold will be released immediately. The recorded payment
              ledger and receipt history will remain intact for audit purposes.
            </p>
            <strong>
              Review the saved cancellation terms before issuing any refund.
            </strong>
          </div>
          <footer className="customer-modal-actions">
            <button
              className="btn btn-outline"
              type="button"
              disabled={busy}
              onClick={() => setCancelBooking(null)}
            >
              Keep booking
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={busy}
              onClick={() => void confirmCancellation()}
            >
              Cancel booking
            </button>
          </footer>
        </ModalShell>
      ) : null}

      {busy &&
      !customerModal &&
      !bookingForm &&
      !paymentModal &&
      !cancelBooking ? (
        <div className="customer-page-lock">
          <div className="orbit-loader">
            <i />
            <i />
            <i />
          </div>
          <strong>Processing...</strong>
        </div>
      ) : null}
    </div>
  );
}
