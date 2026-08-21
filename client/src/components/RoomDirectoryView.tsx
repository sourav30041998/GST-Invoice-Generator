import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Archive,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../api";
import type {
  Room,
  RoomAllocation,
  RoomAllocationHistory,
  RoomBookingBoard,
  RoomInput,
} from "../types";

type RoomDirectoryViewProps = {
  showToast: (message: string) => void;
  onOpenInvoice: (
    invoiceNumber: string,
    workflowStatus: RoomAllocation["status"],
  ) => void;
};

type RoomDirectoryTab = "booking" | "directory";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const BOARD_TRANSITION_MIN_DURATION_MS = 700;
const ROOM_ACTIVITY_MIN_DURATION_MS = 620;
const BOARD_RANGE_OPTIONS = [7, 14, 31] as const;
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyRoomForm = (): RoomInput => ({
  roomNumber: "",
  roomType: "",
  floor: "",
  wing: "",
  capacity: 1,
});

function roomLabel(room: Room) {
  return [room.roomType, room.wing, room.floor].filter(Boolean).join(" - ");
}

function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDays(start: string, length: number) {
  return Array.from({ length }, (_value, index) => addDays(start, index));
}

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function shiftMonth(value: string, months: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.toISOString().slice(0, 7)}-01`;
}

function getCalendarDays(month: string) {
  const monthDate = new Date(`${month}T00:00:00.000Z`);
  const firstWeekday = monthDate.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return Array.from({ length: 42 }, (_value, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth
      ? `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`
      : null;
  });
}

function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) -
      Date.parse(`${start}T00:00:00.000Z`)) /
      DAY_IN_MILLISECONDS,
  );
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function monthLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function allocationLabel(status: RoomAllocation["status"]) {
  if (status === "checkedIn") return "Checked in";
  if (status === "checkedOut") return "Checked out";
  if (status === "cancelled") return "Cancelled";
  return "Reserved";
}

function RoomActivityLoader({ label }: { label: string }) {
  return (
    <div className="room-activity-loader" role="status" aria-live="polite">
      <span className="room-activity-scan" aria-hidden="true">
        <span className="room-activity-gate" />
        <span className="room-activity-gate" />
        <span className="room-activity-gate" />
        <span className="room-activity-scanline" />
      </span>
      <span>{label}</span>
    </div>
  );
}

function bookingPosition(
  allocation: RoomAllocation,
  boardStart: string,
  dayCount: number,
) {
  const startsAt = Math.max(0, daysBetween(boardStart, allocation.checkinDate));
  const endsAt = Math.min(
    dayCount,
    daysBetween(boardStart, allocation.checkoutDate),
  );
  return { start: startsAt, span: Math.max(1, endsAt - startsAt) };
}

export function RoomDirectoryView({
  showToast,
  onOpenInvoice,
}: RoomDirectoryViewProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [status, setStatus] = useState<"active" | "inactive" | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomInput>(emptyRoomForm);
  const [activeTab, setActiveTab] = useState<RoomDirectoryTab>("booking");
  const [historyRoom, setHistoryRoom] = useState<Room | null>(null);
  const [allocations, setAllocations] = useState<RoomAllocation[]>([]);
  const [historyPagination, setHistoryPagination] = useState<
    RoomAllocationHistory["pagination"] | null
  >(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [boardStart, setBoardStart] = useState(toLocalIsoDate);
  const [boardDays, setBoardDays] =
    useState<(typeof BOARD_RANGE_OPTIONS)[number]>(14);
  const [displayedBoardStart, setDisplayedBoardStart] = useState(boardStart);
  const [displayedBoardDays, setDisplayedBoardDays] = useState(boardDays);
  const [bookingBoard, setBookingBoard] = useState<RoomBookingBoard | null>(
    null,
  );
  const [bookingBoardLoading, setBookingBoardLoading] = useState(true);
  const [boardTransitioning, setBoardTransitioning] = useState(true);
  const [boardContentVersion, setBoardContentVersion] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<RoomAllocation | null>(
    null,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(toLocalIsoDate()),
  );
  const dialogRef = useRef<HTMLElement>(null);
  const roomNameInputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const bookingBoardRequestRef = useRef(0);
  const roomHistoryRequestRef = useRef(0);
  const displayedBoardRef = useRef({ start: boardStart, days: boardDays });

  const boardEnd = useMemo(
    () => addDays(boardStart, boardDays),
    [boardDays, boardStart],
  );
  const boardDateCells = useMemo(
    () => getDays(displayedBoardStart, displayedBoardDays),
    [displayedBoardDays, displayedBoardStart],
  );
  const calendarDateCells = useMemo(
    () => getCalendarDays(calendarMonth),
    [calendarMonth],
  );
  const today = toLocalIsoDate();
  const isCurrentDate = boardStart === today;
  const bookingGridStyle = useMemo<CSSProperties>(
    () => ({
      gridTemplateColumns: `220px repeat(${boardDateCells.length}, minmax(58px, 1fr))`,
      minWidth: `${220 + boardDateCells.length * 58}px`,
    }),
    [boardDateCells.length],
  );

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      setRooms(await api.listRooms(status, search));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not load rooms.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, showToast, status]);

  const loadBookingBoard = useCallback(async () => {
    const requestId = bookingBoardRequestRef.current + 1;
    const transitionStartedAt = performance.now();
    bookingBoardRequestRef.current = requestId;
    setBookingBoardLoading(true);
    setBoardTransitioning(true);
    try {
      const nextBookingBoard = await api.getRoomBookingBoard(
        boardStart,
        boardEnd,
      );
      if (requestId !== bookingBoardRequestRef.current) return;

      const remainingTransitionTime = Math.max(
        0,
        BOARD_TRANSITION_MIN_DURATION_MS -
          (performance.now() - transitionStartedAt),
      );
      if (remainingTransitionTime) {
        await wait(remainingTransitionTime);
      }
      if (requestId !== bookingBoardRequestRef.current) return;

      setBookingBoard(nextBookingBoard);
      displayedBoardRef.current = { start: boardStart, days: boardDays };
      setDisplayedBoardStart(boardStart);
      setDisplayedBoardDays(boardDays);
      setBoardContentVersion((current) => current + 1);
    } catch (error) {
      if (requestId !== bookingBoardRequestRef.current) return;
      setBoardStart(displayedBoardRef.current.start);
      setBoardDays(displayedBoardRef.current.days);
      showToast(
        error instanceof Error
          ? error.message
          : "Could not load booking board.",
      );
    } finally {
      if (requestId === bookingBoardRequestRef.current) {
        setBookingBoardLoading(false);
        setBoardTransitioning(false);
      }
    }
  }, [boardDays, boardEnd, boardStart, showToast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRooms(), 180);
    return () => window.clearTimeout(timeout);
  }, [loadRooms]);

  useEffect(() => {
    void loadBookingBoard();
  }, [loadBookingBoard]);

  useEffect(() => {
    if (!calendarOpen) return;

    const closeCalendarOnOutsidePointer = (event: PointerEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const closeCalendarOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };

    document.addEventListener("pointerdown", closeCalendarOnOutsidePointer);
    window.addEventListener("keydown", closeCalendarOnEscape);
    return () => {
      document.removeEventListener(
        "pointerdown",
        closeCalendarOnOutsidePointer,
      );
      window.removeEventListener("keydown", closeCalendarOnEscape);
    };
  }, [calendarOpen]);

  useEffect(() => {
    if (!showForm && !historyRoom) return;

    const previousOverflow = document.body.style.overflow;
    const focusableSelector =
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (historyRoom) {
          setHistoryRoom(null);
        } else {
          resetForm();
        }
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
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

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      if (showForm) {
        roomNameInputRef.current?.focus();
      } else {
        dialogRef.current
          ?.querySelector<HTMLElement>(focusableSelector)
          ?.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historyRoom, showForm]);

  const roomInventory = useMemo(
    () => bookingBoard?.rooms || rooms,
    [bookingBoard?.rooms, rooms],
  );
  const roomCount = useMemo(
    () => ({
      total: roomInventory.length,
      active: roomInventory.filter((room) => room.isActive).length,
    }),
    [roomInventory],
  );

  const bookingsByRoom = useMemo(() => {
    const byRoom = new Map<string, RoomAllocation[]>();
    bookingBoard?.allocations.forEach((allocation) => {
      if (!allocation.roomId) return;
      const roomBookings = byRoom.get(allocation.roomId) || [];
      roomBookings.push(allocation);
      byRoom.set(allocation.roomId, roomBookings);
    });
    return byRoom;
  }, [bookingBoard]);

  const selectedBookingRoom = useMemo(
    () =>
      bookingBoard?.rooms.find(
        (room) => room._id === selectedBooking?.roomId,
      ) || null,
    [bookingBoard?.rooms, selectedBooking?.roomId],
  );

  const resetForm = () => {
    setEditingRoom(null);
    setForm(emptyRoomForm());
    setShowForm(false);
  };

  const beginEdit = (room: Room) => {
    setEditingRoom(room);
    setForm({
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      floor: room.floor,
      wing: room.wing,
      capacity: room.capacity,
    });
    setShowForm(true);
  };

  const saveRoom = async () => {
    const startedAt = performance.now();
    setSaving(true);
    try {
      if (editingRoom) {
        await api.updateRoom(editingRoom._id, {
          ...form,
          version: editingRoom.version,
        });
      } else {
        await api.createRoom(form);
      }
      await Promise.all([loadRooms(), loadBookingBoard()]);
      const remainingDuration = Math.max(
        0,
        ROOM_ACTIVITY_MIN_DURATION_MS - (performance.now() - startedAt),
      );
      if (remainingDuration) {
        await wait(remainingDuration);
      }
      const message = editingRoom
        ? "Room updated."
        : "Room added to the directory.";
      resetForm();
      showToast(message);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not save room.",
      );
    } finally {
      setSaving(false);
    }
  };

  const archiveRoom = async (room: Room) => {
    if (!window.confirm(`Deactivate room ${room.roomNumber}?`)) {
      return;
    }
    try {
      await api.archiveRoom(room._id);
      showToast("Room deactivated.");
      await Promise.all([loadRooms(), loadBookingBoard()]);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not deactivate room.",
      );
    }
  };

  const showHistory = async (room: Room, page = 1) => {
    const requestId = roomHistoryRequestRef.current + 1;
    const startedAt = performance.now();
    roomHistoryRequestRef.current = requestId;
    setHistoryRoom(room);
    setAllocations([]);
    setHistoryPagination(null);
    setHistoryLoading(true);
    try {
      const history = await api.listRoomAllocations(room._id, page);
      if (requestId !== roomHistoryRequestRef.current) return;
      const remainingDuration = Math.max(
        0,
        ROOM_ACTIVITY_MIN_DURATION_MS - (performance.now() - startedAt),
      );
      if (remainingDuration) {
        await wait(remainingDuration);
      }
      if (requestId !== roomHistoryRequestRef.current) return;
      setAllocations(history.items);
      setHistoryPagination(history.pagination);
    } catch (error) {
      if (requestId !== roomHistoryRequestRef.current) return;
      setAllocations([]);
      setHistoryPagination(null);
      showToast(
        error instanceof Error ? error.message : "Could not load room history.",
      );
    } finally {
      if (requestId === roomHistoryRequestRef.current) {
        setHistoryLoading(false);
      }
    }
  };

  const openHistoryInvoice = (allocation: RoomAllocation) => {
    setHistoryRoom(null);
    onOpenInvoice(allocation.invoiceNumber, allocation.status);
  };

  return (
    <div className="view-stack room-directory-view">
      <section className="room-directory-header">
        <div>
          <span className="room-directory-kicker">
            Organization room inventory
          </span>
          <h2>Room Directory</h2>
          <p>
            {roomCount.active} active of {roomCount.total} listed rooms
          </p>
        </div>
        <div className="room-directory-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => void Promise.all([loadRooms(), loadBookingBoard()])}
            title="Refresh room directory and booking board"
            disabled={loading || bookingBoardLoading}
          >
            <RefreshCw
              size={16}
              className={loading || bookingBoardLoading ? "spin-icon" : ""}
            />
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus size={16} />
            Add new room
          </button>
        </div>
      </section>

      <div
        className="room-directory-tabs"
        role="tablist"
        aria-label="Room directory views"
      >
        <button
          aria-controls="booking-board-panel"
          aria-selected={activeTab === "booking"}
          className={activeTab === "booking" ? "active" : ""}
          id="booking-board-tab"
          onClick={() => setActiveTab("booking")}
          role="tab"
          type="button"
        >
          <CalendarDays size={16} />
          Booking board
        </button>
        <button
          aria-controls="room-directory-panel"
          aria-selected={activeTab === "directory"}
          className={activeTab === "directory" ? "active" : ""}
          id="room-directory-tab"
          onClick={() => setActiveTab("directory")}
          role="tab"
          type="button"
        >
          <BedDouble size={16} />
          Room directory
          <span>{roomCount.total}</span>
        </button>
      </div>

      {activeTab === "booking" ? (
      <section
        className="panel booking-board-panel room-directory-tab-panel"
        id="booking-board-panel"
        role="tabpanel"
        aria-labelledby="booking-board-tab"
      >
        <div className="booking-board-titlebar">
          <div className="booking-board-title">
            <CalendarDays size={18} />
            <div>
              <span className="booking-board-kicker">Room schedule</span>
              <h3>Booking Board</h3>
            </div>
          </div>
          <div className="booking-board-controls">
            <div
              className="booking-range-control"
              role="group"
              aria-label="Booking board range"
            >
              {BOARD_RANGE_OPTIONS.map((range) => (
                <button
                  className={range === boardDays ? "active" : ""}
                  type="button"
                  key={range}
                  onClick={() => {
                    setBoardDays(range);
                    setSelectedBooking(null);
                  }}
                >
                  {range} days
                </button>
              ))}
            </div>
            <div className="booking-date-control-stack">
              <div className="booking-date-navigation">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setBoardStart((current) => addDays(current, -boardDays));
                    setSelectedBooking(null);
                    setCalendarOpen(false);
                  }}
                  title="Show previous dates"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="booking-date-picker" ref={calendarRef}>
                  <button
                    className="booking-date-range"
                    type="button"
                    onClick={() => {
                      if (!calendarOpen) {
                        setCalendarMonth(startOfMonth(boardStart));
                      }
                      setCalendarOpen((current) => !current);
                    }}
                    title="Choose booking board start date"
                    aria-expanded={calendarOpen}
                    aria-controls="booking-board-calendar"
                  >
                    <CalendarDays size={14} />
                    <span>
                      {dateLabel(boardStart)} -{" "}
                      {dateLabel(addDays(boardEnd, -1))}
                    </span>
                  </button>
                  {calendarOpen ? (
                    <div
                      className="booking-calendar-popover"
                      id="booking-board-calendar"
                      role="dialog"
                      aria-label="Choose booking board start date"
                    >
                      <div className="booking-calendar-header">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() =>
                            setCalendarMonth((current) =>
                              shiftMonth(current, -1),
                            )
                          }
                          title="Show previous month"
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <strong>{monthLabel(calendarMonth)}</strong>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() =>
                            setCalendarMonth((current) =>
                              shiftMonth(current, 1),
                            )
                          }
                          title="Show next month"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                      <div
                        className="booking-calendar-weekdays"
                        aria-hidden="true"
                      >
                        {CALENDAR_WEEKDAYS.map((weekday) => (
                          <span key={weekday}>{weekday}</span>
                        ))}
                      </div>
                      <div className="booking-calendar-days">
                        {calendarDateCells.map((date, index) => {
                          if (!date) {
                            return (
                              <span
                                className="booking-calendar-blank"
                                key={index}
                              />
                            );
                          }
                          const isSelected = date === boardStart;
                          const isInRange =
                            date >= boardStart && date < boardEnd;
                          return (
                            <button
                              aria-label={`${dateLabel(date)}. Start ${boardDays}-day view`}
                              className={`booking-calendar-day${isSelected ? " selected" : ""}${isInRange ? " in-range" : ""}${date === today ? " today" : ""}`}
                              key={date}
                              type="button"
                              onClick={() => {
                                setBoardStart(date);
                                setSelectedBooking(null);
                                setCalendarOpen(false);
                              }}
                            >
                              {Number(date.slice(-2))}
                            </button>
                          );
                        })}
                      </div>
                      <div className="booking-calendar-footer">
                        <span>{boardDays}-day view</span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setBoardStart((current) => addDays(current, boardDays));
                    setSelectedBooking(null);
                    setCalendarOpen(false);
                  }}
                  title="Show next dates"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              {!isCurrentDate ? (
                <button
                  className="booking-return-today"
                  type="button"
                  onClick={() => {
                    setBoardStart(today);
                    setCalendarMonth(startOfMonth(today));
                    setSelectedBooking(null);
                    setCalendarOpen(false);
                  }}
                >
                  Go to current date
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="booking-board-legend"
          aria-label="Booking status legend"
        >
          <span className="booking-legend reserved">Reserved</span>
          <span className="booking-legend checkedIn">Checked in</span>
        </div>

        <div
          className={`booking-board-scroll${boardTransitioning && bookingBoard ? " is-updating" : ""}`}
          aria-busy={bookingBoardLoading}
        >
          {boardTransitioning && bookingBoard ? (
            <div className="booking-board-update-overlay" role="status">
              <RefreshCw size={15} className="spin-icon" />
              Updating schedule
            </div>
          ) : null}
          <div className="booking-board-content" key={boardContentVersion}>
            <div
              className="booking-board-grid booking-board-head"
              style={bookingGridStyle}
            >
              <div className="booking-room-heading">Room</div>
              {boardDateCells.map((date) => (
                <div className="booking-day-heading" key={date}>
                  {dayLabel(date)}
                </div>
              ))}
            </div>

            {bookingBoardLoading && !bookingBoard ? (
              <div className="booking-board-loading" style={bookingGridStyle}>
                Loading room schedule...
              </div>
            ) : bookingBoard?.rooms.length ? (
              bookingBoard.rooms.map((room) => {
                const roomBookings = bookingsByRoom.get(room._id) || [];
                return (
                  <div
                    className={`booking-room-row${room.isActive ? "" : " inactive"}`}
                    key={room._id}
                    style={bookingGridStyle}
                  >
                    <button
                      className="booking-room-meta"
                      type="button"
                      onClick={() => void showHistory(room)}
                      title={`View ${room.roomNumber} allocation history`}
                    >
                      <BedDouble size={15} />
                      <span>
                        <strong>{room.roomNumber}</strong>
                        <small>{roomLabel(room) || "Room"}</small>
                      </span>
                      {!room.isActive ? <em>Inactive</em> : null}
                    </button>
                    <div
                      className="booking-schedule"
                      style={{
                        gridTemplateColumns: `repeat(${boardDateCells.length}, minmax(58px, 1fr))`,
                      }}
                    >
                      {boardDateCells.map((date) => (
                        <span className="booking-day-cell" key={date} />
                      ))}
                      {roomBookings.length ? (
                        roomBookings.map((allocation) => {
                          const position = bookingPosition(
                            allocation,
                            displayedBoardStart,
                            boardDateCells.length,
                          );
                          return (
                            <button
                              aria-label={`${room.roomNumber}, invoice ${allocation.invoiceNumber}, ${allocationLabel(allocation.status)}, ${dateLabel(allocation.checkinDate)} to ${dateLabel(allocation.checkoutDate)}`}
                              className={`booking-bar ${allocation.status}${selectedBooking?._id === allocation._id ? " selected" : ""}`}
                              key={allocation._id}
                              onClick={() => setSelectedBooking(allocation)}
                              style={{
                                gridColumn: `${position.start + 1} / span ${position.span}`,
                              }}
                              title={`${allocation.invoiceNumber}: ${allocationLabel(allocation.status)}`}
                              type="button"
                            >
                              <span>{allocation.invoiceNumber}</span>
                            </button>
                          );
                        })
                      ) : (
                        <span className="booking-open-window">Open</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="booking-board-empty" style={bookingGridStyle}>
                No configured rooms in this organization yet.
              </div>
            )}
          </div>
        </div>

        {selectedBooking ? (
          <div className="booking-inspector" role="status">
            <div className="booking-inspector-main">
              <span
                className={`booking-inspector-status ${selectedBooking.status}`}
              >
                {allocationLabel(selectedBooking.status)}
              </span>
              <strong>
                {selectedBookingRoom?.roomNumber ||
                  selectedBooking.roomNumberSnapshot}
              </strong>
              <span>Invoice {selectedBooking.invoiceNumber}</span>
              <span>
                {dateLabel(selectedBooking.checkinDate)} to{" "}
                {dateLabel(selectedBooking.checkoutDate)}
              </span>
            </div>
            <div className="booking-inspector-actions">
              <button
                className="icon-button"
                type="button"
                onClick={() => setSelectedBooking(null)}
                title="Close booking details"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </section>
      ) : (
        <section
          className="panel room-directory-tab-panel"
          id="room-directory-panel"
          role="tabpanel"
          aria-labelledby="room-directory-tab"
        >
          <div className="room-directory-toolbar">
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rooms, floor, wing, or type"
                aria-label="Search rooms"
              />
              <select
                className="input"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as "active" | "inactive" | "all",
                  )
                }
                aria-label="Room status filter"
              >
                <option value="all">All rooms</option>
                <option value="active">Active rooms</option>
                <option value="inactive">Inactive rooms</option>
              </select>
            </div>
            <div className="table-wrap">
              <table className="data-table room-directory-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Type / Location</th>
                    <th className="text-right">Capacity</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="empty-row" colSpan={5}>
                        Loading rooms...
                      </td>
                    </tr>
                  ) : rooms.length ? (
                    rooms.map((room) => (
                      <tr key={room._id}>
                        <td>
                          <strong className="room-number-cell">
                            <BedDouble size={15} />
                            {room.roomNumber}
                          </strong>
                        </td>
                        <td>{roomLabel(room) || "-"}</td>
                        <td className="text-right">{room.capacity}</td>
                        <td>
                          <span
                            className={`status-badge${room.isActive ? "" : " danger"}`}
                          >
                            {room.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="room-row-actions">
                            <button
                              className="btn btn-outline room-history-trigger"
                              type="button"
                              onClick={() => void showHistory(room)}
                              title={`View ${room.roomNumber} allocation history`}
                            >
                              <ClipboardList size={15} />
                              Transaction history
                            </button>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => beginEdit(room)}
                              title={`Edit ${room.roomNumber}`}
                            >
                              <Pencil size={15} />
                            </button>
                            {room.isActive ? (
                              <button
                                className="icon-button danger"
                                type="button"
                                onClick={() => void archiveRoom(room)}
                                title={`Deactivate ${room.roomNumber}`}
                              >
                                <Archive size={15} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-row" colSpan={5}>
                        No rooms match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
        </section>
      )}

      {showForm ? (
        <div className="room-modal-backdrop" role="presentation">
          <section
            className="room-modal room-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-editor-title"
            ref={dialogRef}
          >
            <header className="room-modal-header">
              <div className="room-modal-heading">
                <span className="room-modal-icon">
                  <BedDouble size={19} />
                </span>
                <div>
                  <span className="room-modal-kicker">Room configuration</span>
                  <h3 id="room-editor-title">
                    {editingRoom ? "Edit room" : "Add new room"}
                  </h3>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={resetForm}
                title="Close room editor"
                disabled={saving}
              >
                <X size={16} />
              </button>
            </header>
            <form
              className="room-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveRoom();
              }}
            >
              <div className="room-form-grid">
                <label className="field">
                  <span>Room name or number</span>
                  <input
                    className="input"
                    value={form.roomNumber}
                    maxLength={40}
                    ref={roomNameInputRef}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        roomNumber: event.target.value,
                      }))
                    }
                    placeholder="A-101"
                    required
                  />
                </label>
                <label className="field">
                  <span>Room type</span>
                  <input
                    className="input"
                    value={form.roomType}
                    maxLength={80}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        roomType: event.target.value,
                      }))
                    }
                    placeholder="Deluxe"
                  />
                </label>
                <label className="field">
                  <span>Floor</span>
                  <input
                    className="input"
                    value={form.floor}
                    maxLength={40}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        floor: event.target.value,
                      }))
                    }
                    placeholder="First floor"
                  />
                </label>
                <label className="field">
                  <span>Wing</span>
                  <input
                    className="input"
                    value={form.wing}
                    maxLength={40}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        wing: event.target.value,
                      }))
                    }
                    placeholder="East wing"
                  />
                </label>
                <label className="field room-capacity-field">
                  <span>Capacity</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="50"
                    value={form.capacity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        capacity: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </label>
              </div>
              <footer className="room-modal-actions">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={saving || !form.roomNumber.trim()}
                >
                  {saving ? "Saving..." : "Save room"}
                </button>
              </footer>
            </form>
            {saving ? (
              <div className="room-modal-saving-overlay">
                <RoomActivityLoader
                  label={
                    editingRoom
                      ? "Updating room details"
                      : "Adding room to directory"
                  }
                />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {historyRoom ? (
        <div className="room-modal-backdrop" role="presentation">
          <section
            className="room-modal room-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-history-title"
            ref={dialogRef}
          >
            <header className="room-modal-header">
              <div className="room-modal-heading">
                <span className="room-modal-icon">
                  <ClipboardList size={19} />
                </span>
                <div>
                  <span className="room-modal-kicker">Room record</span>
                  <h3 id="room-history-title">
                    {historyRoom.roomNumber} transaction history
                  </h3>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setHistoryRoom(null)}
                title="Close transaction history"
              >
                <X size={16} />
              </button>
            </header>
            <div className="room-history-modal-body">
              {historyLoading ? (
                <RoomActivityLoader label="Retrieving room activity" />
              ) : (
                <div className="table-wrap">
                  <table className="data-table room-history-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Arrival</th>
                        <th>Departure</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.length ? (
                        allocations.map((allocation) => (
                          <tr key={allocation._id}>
                            <td>
                              <button
                                className="invoice-link-button room-history-invoice-link"
                                type="button"
                                onClick={() => openHistoryInvoice(allocation)}
                                title={`Open invoice ${allocation.invoiceNumber}`}
                              >
                                {allocation.invoiceNumber}
                              </button>
                            </td>
                            <td>{dateLabel(allocation.checkinDate)}</td>
                            <td>{dateLabel(allocation.checkoutDate)}</td>
                            <td>
                              <span
                                className={`room-history-status ${allocation.status}`}
                              >
                                {allocationLabel(allocation.status)}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="empty-row" colSpan={4}>
                            No transactions for this room yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <footer className="room-modal-actions room-history-actions">
              <div
                className="room-history-pagination"
                aria-label="Transaction history pagination"
              >
                <span>
                  {historyPagination
                    ? `Last 12 months | Page ${historyPagination.page} of ${historyPagination.totalPages}`
                    : "Last 12 months"}
                </span>
                <div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => {
                      if (historyRoom && historyPagination) {
                        void showHistory(
                          historyRoom,
                          historyPagination.page - 1,
                        );
                      }
                    }}
                    title="Show newer invoices"
                    disabled={
                      historyLoading || !historyPagination?.hasPreviousPage
                    }
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => {
                      if (historyRoom && historyPagination) {
                        void showHistory(
                          historyRoom,
                          historyPagination.page + 1,
                        );
                      }
                    }}
                    title="Show older invoices"
                    disabled={historyLoading || !historyPagination?.hasNextPage}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setHistoryRoom(null)}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      ) : null}

    </div>
  );
}
