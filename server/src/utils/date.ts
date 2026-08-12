export function todayLocalIso() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toInvoiceMonth(dateValue?: string) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) {
    return toInvoiceMonth();
  }

  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}
