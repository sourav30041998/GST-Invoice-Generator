import { ApiError } from "../middleware/errorHandler.js";

export type PersistedInvoiceWorkflowStatus =
  "draft" | "reserved" | "checkedIn" | "checkedOut" | "cancelled";

export type EditableInvoiceWorkflowStatus =
  | "reserved"
  | "checkedIn"
  | "checkedOut";

export function assertExpectedVersion(
  actualVersion: number | undefined,
  expectedVersion: number,
  entityName: string,
) {
  if ((actualVersion ?? 0) !== expectedVersion) {
    throw new ApiError(
      409,
      `${entityName} was changed elsewhere. Reload it before saving your changes.`,
    );
  }
}

export function assertInvoiceWorkflowTransition(
  currentStatus: PersistedInvoiceWorkflowStatus,
  nextStatus: EditableInvoiceWorkflowStatus,
) {
  if (currentStatus === "cancelled") {
    throw new ApiError(409, "Cancelled invoices cannot be edited");
  }

  if (currentStatus === "checkedOut") {
    throw new ApiError(
      409,
      "Checked-out invoices are locked. Cancel the invoice and issue a corrected one instead.",
    );
  }

  if (currentStatus === "reserved") {
    if (nextStatus !== "reserved" && nextStatus !== "checkedIn") {
      throw new ApiError(
        422,
        "A reserved invoice can only remain reserved or be checked in",
      );
    }
    return;
  }

  if (currentStatus === "checkedIn") {
    if (nextStatus !== "checkedIn" && nextStatus !== "checkedOut") {
      throw new ApiError(
        422,
        "A checked-in invoice can only remain checked in or be checked out",
      );
    }
    return;
  }

  if (currentStatus === "draft") {
    throw new ApiError(
      409,
      "Draft invoices must be issued through the draft workflow",
    );
  }
}
