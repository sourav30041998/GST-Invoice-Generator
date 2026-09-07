import {
  decryptProtectedJson,
  encryptProtectedJson,
  isProtectedEnvelope,
} from "./dataProtectionService.js";

type AnyRecord = Record<string, any>;

export type CustomerSensitiveData = {
  name: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  notes: string;
  whatsappOptIn: boolean;
  whatsappOptInRecordedAt: string;
};

export type BookingSensitiveData = {
  notes: string;
  termsSnapshot: string;
  requestedRooms: Array<{
    roomType: string;
    bedsPerRoom: number;
    quantity: number;
  }>;
};

export type PaymentSensitiveData = {
  reference: string;
  notes: string;
};

function withoutProtectedData(record: AnyRecord) {
  const { protectedData: _protectedData, ...publicRecord } = record;
  return publicRecord;
}

export function protectCustomerData(
  organizationId: string,
  record: CustomerSensitiveData,
) {
  return encryptProtectedJson("customer", organizationId, record);
}

export function revealCustomerRecord(
  record: AnyRecord,
  organizationId: string,
) {
  const publicRecord = withoutProtectedData(record);
  if (!isProtectedEnvelope(record.protectedData)) {
    return publicRecord;
  }
  return {
    ...publicRecord,
    ...decryptProtectedJson<CustomerSensitiveData>(
      "customer",
      organizationId,
      record.protectedData,
    ),
  };
}

export function protectBookingData(
  organizationId: string,
  record: BookingSensitiveData,
) {
  return encryptProtectedJson("booking", organizationId, record);
}

export function revealBookingRecord(
  record: AnyRecord,
  organizationId: string,
) {
  const publicRecord = withoutProtectedData(record);
  if (!isProtectedEnvelope(record.protectedData)) {
    return publicRecord;
  }
  return {
    ...publicRecord,
    ...decryptProtectedJson<BookingSensitiveData>(
      "booking",
      organizationId,
      record.protectedData,
    ),
  };
}

export function protectPaymentData(
  organizationId: string,
  record: PaymentSensitiveData,
) {
  return encryptProtectedJson("booking-payment", organizationId, record);
}

export function revealPaymentRecord(
  record: AnyRecord,
  organizationId: string,
) {
  const publicRecord = withoutProtectedData(record);
  if (!isProtectedEnvelope(record.protectedData)) {
    return publicRecord;
  }
  return {
    ...publicRecord,
    ...decryptProtectedJson<PaymentSensitiveData>(
      "booking-payment",
      organizationId,
      record.protectedData,
    ),
  };
}
