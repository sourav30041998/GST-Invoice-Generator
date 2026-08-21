import { ApiError } from "../middleware/errorHandler.js";

export type PersistedInvoiceWorkflowStatus =
  "draft" | "checkedIn" | "checkedOut" | "cancelled";

export type EditableInvoiceWorkflowStatus = "checkedIn" | "checkedOut";

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

  if (currentStatus !== "checkedIn") {
    throw new ApiError(409, "Only checked-in invoices can be updated");
  }

  if (nextStatus !== "checkedIn" && nextStatus !== "checkedOut") {
    throw new ApiError(
      422,
      "An issued invoice can only remain checked in or be checked out",
    );
  }
}
