import type { RequestHandler, Response } from "express";
import { getAuthContext } from "../middleware/auth.js";
import {
  createCustomer,
  deactivateCustomer,
  getCustomer,
  listCustomers,
  lookupCustomerByPhone,
  updateCustomer,
} from "../services/customerService.js";
import type { TenantContext } from "../services/invoiceService.js";
import {
  createCustomerSchema,
  customerIdSchema,
  customerListQuerySchema,
  customerLookupQuerySchema,
  customerRevisionSchema,
  updateCustomerSchema,
} from "../validation/customerSchemas.js";

function tenantContext(res: Response): TenantContext {
  const context = getAuthContext(res);
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    userEmail: context.email,
  };
}

export const listCustomerRecords: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await listCustomers(
        tenantContext(res),
        customerListQuerySchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const lookupCustomerRecord: RequestHandler = async (req, res, next) => {
  try {
    const query = customerLookupQuerySchema.parse(req.body);
    res.json(await lookupCustomerByPhone(tenantContext(res), query.phone));
  } catch (error) {
    next(error);
  }
};

export const getCustomerRecord: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await getCustomer(
        tenantContext(res),
        customerIdSchema.parse(req.params.customerId),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const createCustomerRecord: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(201)
      .json(
        await createCustomer(
          tenantContext(res),
          createCustomerSchema.parse(req.body),
        ),
      );
  } catch (error) {
    next(error);
  }
};

export const updateCustomerRecord: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await updateCustomer(
        tenantContext(res),
        customerIdSchema.parse(req.params.customerId),
        updateCustomerSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const deactivateCustomerRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    await deactivateCustomer(
      tenantContext(res),
      customerIdSchema.parse(req.params.customerId),
      customerRevisionSchema.parse(req.body).version,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
