import { type ClientSession, Types } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BookingModel } from "../models/Booking.js";
import { CustomerModel } from "../models/Customer.js";
import {
  buildCustomerSearchTokens,
  customerPhoneLookupHash,
  customerSearchToken,
  maskPhone,
} from "../utils/customerRules.js";
import type {
  CreateCustomerPayload,
  CustomerListQuery,
  UpdateCustomerPayload,
} from "../validation/customerSchemas.js";
import type { TenantContext } from "./invoiceService.js";
import {
  protectCustomerData,
  revealCustomerRecord,
  type CustomerSensitiveData,
} from "./customerProtectionService.js";

function customerResponse(record: Record<string, any>, organizationId: string) {
  const revealed = revealCustomerRecord(record, organizationId);
  const {
    organizationId: _organizationId,
    phoneLookupHash: _phoneLookupHash,
    searchTokens: _searchTokens,
    displayName: _displayName,
    protectedData: _protectedData,
    createdByUserId: _createdByUserId,
    updatedByUserId: _updatedByUserId,
    ...clientRecord
  } = revealed;
  return {
    ...clientRecord,
    _id: String(clientRecord._id),
    whatsappOptIn: Boolean(clientRecord.whatsappOptIn),
  };
}

function customerSummaryResponse(
  record: Record<string, any>,
  organizationId: string,
) {
  const revealed = revealCustomerRecord(record, organizationId);
  return {
    _id: String(revealed._id),
    name: revealed.name,
    phoneMasked: maskPhone(revealed.phone),
    status: revealed.status,
    version: revealed.version,
  };
}

async function writeCustomerAudit(
  tenant: TenantContext,
  entityId: unknown,
  action: string,
  before: unknown,
  after: unknown,
  session?: ClientSession,
) {
  const entry = {
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    entityType: "customer",
    entityId: String(entityId),
    action,
    before,
    after,
    createdBy: `user:${tenant.userId}`,
  };
  if (session) {
    await AuditLogModel.create([entry], { session });
    return;
  }
  await AuditLogModel.create(entry);
}

function protectedFields(
  payload: CreateCustomerPayload,
): CustomerSensitiveData {
  return {
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    address: payload.address,
    state: payload.state,
    notes: payload.notes,
    whatsappOptIn: payload.whatsappOptIn,
    whatsappOptInRecordedAt: payload.whatsappOptIn
      ? new Date().toISOString()
      : "",
  };
}

export async function createCustomer(
  tenant: TenantContext,
  payload: CreateCustomerPayload,
) {
  const sensitive = protectedFields(payload);
  const customer = new CustomerModel({
    organizationId: tenant.organizationId,
    displayName: "Protected customer",
    phoneLookupHash: customerPhoneLookupHash(
      tenant.organizationId,
      payload.phone,
    ),
    searchTokens: buildCustomerSearchTokens(tenant.organizationId, {
      name: payload.name,
      email: payload.email,
      normalizedPhone: payload.phone,
    }),
    protectedData: protectCustomerData(tenant.organizationId, sensitive),
    createdByUserId: tenant.userId,
    updatedByUserId: tenant.userId,
  });

  try {
    await customer.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(
        409,
        "A customer with this phone number already exists in your organization.",
      );
    }
    throw error;
  }
  await writeCustomerAudit(tenant, customer._id, "create", null, {
    status: customer.status,
    whatsappOptIn: sensitive.whatsappOptIn,
  });

  return customerResponse(
    { ...customer.toObject(), protectedData: customer.protectedData },
    tenant.organizationId,
  );
}

export async function listCustomers(
  tenant: TenantContext,
  query: CustomerListQuery,
) {
  const filter: Record<string, unknown> = {
    organizationId: tenant.organizationId,
  };
  if (query.status !== "all") {
    filter.status = query.status;
  }
  if (query.search) {
    const token = customerSearchToken(tenant.organizationId, query.search);
    if (token) {
      filter.searchTokens = token;
    }
  }

  const totalItems = await CustomerModel.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const records = await CustomerModel.find(filter)
    .select("+protectedData")
    .sort({ updatedAt: -1, _id: -1 })
    .skip((page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean();
  const customerIds = records.map((record) => record._id);
  const bookingCounts = customerIds.length
    ? await BookingModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            organizationId: new Types.ObjectId(tenant.organizationId),
            customerId: { $in: customerIds },
          },
        },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ])
    : [];
  const countByCustomer = new Map(
    bookingCounts.map((item) => [String(item._id), item.count]),
  );

  return {
    items: records.map((record) => ({
      ...customerSummaryResponse(record, tenant.organizationId),
      bookingCount: countByCustomer.get(String(record._id)) || 0,
    })),
    pagination: {
      page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function getCustomer(tenant: TenantContext, customerId: string) {
  const record = await CustomerModel.findOne({
    _id: customerId,
    organizationId: tenant.organizationId,
  })
    .select("+protectedData")
    .lean();
  if (!record) {
    throw new ApiError(404, "Customer not found");
  }
  return customerResponse(record, tenant.organizationId);
}

export async function lookupCustomerByPhone(
  tenant: TenantContext,
  normalizedPhone: string,
) {
  const record = await CustomerModel.findOne({
    organizationId: tenant.organizationId,
    phoneLookupHash: customerPhoneLookupHash(
      tenant.organizationId,
      normalizedPhone,
    ),
    status: "active",
  })
    .select("+protectedData")
    .lean();
  if (!record) {
    throw new ApiError(
      404,
      "No active customer was found for this phone number",
    );
  }
  return customerResponse(record, tenant.organizationId);
}

export async function updateCustomer(
  tenant: TenantContext,
  customerId: string,
  payload: UpdateCustomerPayload,
) {
  const customer = await CustomerModel.findOne({
    _id: customerId,
    organizationId: tenant.organizationId,
  }).select("+protectedData");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }
  if (customer.version !== payload.version) {
    throw new ApiError(
      409,
      "This customer changed elsewhere. Reload it before saving again.",
    );
  }

  const current = revealCustomerRecord(
    { ...customer.toObject(), protectedData: customer.protectedData },
    tenant.organizationId,
  ) as CustomerSensitiveData;
  const next: CustomerSensitiveData = {
    name: payload.name ?? current.name,
    phone: payload.phone ?? current.phone,
    email: payload.email ?? current.email,
    address: payload.address ?? current.address,
    state: payload.state ?? current.state,
    notes: payload.notes ?? current.notes,
    whatsappOptIn: payload.whatsappOptIn ?? Boolean(current.whatsappOptIn),
    whatsappOptInRecordedAt:
      (payload.whatsappOptIn ?? Boolean(current.whatsappOptIn))
        ? payload.whatsappOptIn === true && !current.whatsappOptIn
          ? new Date().toISOString()
          : current.whatsappOptInRecordedAt || new Date().toISOString()
        : "",
  };
  const before = {
    status: customer.status,
    version: customer.version,
    whatsappOptIn: Boolean(current.whatsappOptIn),
  };
  customer.phoneLookupHash = customerPhoneLookupHash(
    tenant.organizationId,
    next.phone,
  );
  customer.searchTokens = buildCustomerSearchTokens(tenant.organizationId, {
    name: next.name,
    email: next.email,
    normalizedPhone: next.phone,
  });
  customer.protectedData = protectCustomerData(tenant.organizationId, next);
  customer.updatedByUserId = new Types.ObjectId(tenant.userId);

  try {
    await customer.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(
        409,
        "A customer with this phone number already exists in your organization.",
      );
    }
    throw error;
  }
  await writeCustomerAudit(tenant, customer._id, "update", before, {
    status: customer.status,
    version: customer.version,
    whatsappOptIn: next.whatsappOptIn,
  });
  return customerResponse(
    { ...customer.toObject(), protectedData: customer.protectedData },
    tenant.organizationId,
  );
}

export async function syncCustomerProfileFromInvoice(
  tenant: TenantContext,
  customerId: string,
  input: {
    expectedVersion: number;
    email: string;
    address: string;
    state: string;
    sourceInvoiceId: string;
  },
  session: ClientSession,
) {
  const customer = await CustomerModel.findOne({
    _id: customerId,
    organizationId: tenant.organizationId,
    status: "active",
  })
    .select("+protectedData")
    .session(session);
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }
  if (customer.version !== input.expectedVersion) {
    throw new ApiError(
      409,
      "The customer profile changed elsewhere. Reload it before updating the current address.",
    );
  }

  const current = revealCustomerRecord(
    { ...customer.toObject(), protectedData: customer.protectedData },
    tenant.organizationId,
  ) as CustomerSensitiveData;
  const next: CustomerSensitiveData = {
    ...current,
    email: input.email || current.email,
    address: input.address,
    state: input.state,
  };
  const changedFields = (["email", "address", "state"] as const).filter(
    (field) => current[field] !== next[field],
  );
  if (!changedFields.length) {
    return customer.version;
  }

  customer.searchTokens = buildCustomerSearchTokens(tenant.organizationId, {
    name: next.name,
    email: next.email,
    normalizedPhone: next.phone,
  });
  customer.protectedData = protectCustomerData(tenant.organizationId, next);
  customer.updatedByUserId = new Types.ObjectId(tenant.userId);
  try {
    await customer.save({ session });
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") {
      throw new ApiError(
        409,
        "The customer profile changed elsewhere. Reload it before updating the current address.",
      );
    }
    throw error;
  }
  await writeCustomerAudit(
    tenant,
    customer._id,
    "invoice_profile_sync",
    { version: input.expectedVersion },
    {
      changedFields,
      sourceInvoiceId: input.sourceInvoiceId,
      version: customer.version,
    },
    session,
  );
  return customer.version;
}

export async function deactivateCustomer(
  tenant: TenantContext,
  customerId: string,
  version: number,
) {
  const customer = await CustomerModel.findOne({
    _id: customerId,
    organizationId: tenant.organizationId,
  });
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }
  if (customer.version !== version) {
    throw new ApiError(
      409,
      "This customer changed elsewhere. Reload it before continuing.",
    );
  }
  const openBooking = await BookingModel.exists({
    organizationId: tenant.organizationId,
    customerId,
    status: { $in: ["enquiry", "pendingAdvance", "confirmed"] },
  });
  if (openBooking) {
    throw new ApiError(
      409,
      "A customer with an open booking cannot be deactivated.",
    );
  }
  customer.status = "inactive";
  customer.updatedByUserId = new Types.ObjectId(tenant.userId);
  await customer.save();
  await writeCustomerAudit(tenant, customer._id, "deactivate", null, {
    status: "inactive",
  });
}
