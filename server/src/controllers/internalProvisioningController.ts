import type { RequestHandler } from "express";
import {
  internalCommandSchema,
  internalListQuerySchema,
  internalObjectIdParamSchema,
  issueInvitationCommandSchema,
  renewInvitationCommandSchema,
  updateOrganizationStatusCommandSchema,
} from "../validation/internalProvisioningSchemas.js";
import {
  getProvisioningOverview,
  issueOrganizationInvitation,
  listProvisionedOrganizations,
  listProvisioningInvitations,
  renewOrganizationInvitation,
  revokeOrganizationInvitation,
  revokeProvisionedOrganizationSessions,
  updateProvisionedOrganizationStatus,
} from "../services/internalProvisioningService.js";

function recordId(params: Record<string, string>) {
  return internalObjectIdParamSchema.parse({ id: params.id }).id;
}

export const internalProvisioningOverview: RequestHandler = async (
  _req,
  res,
  next,
) => {
  try {
    res.json(await getProvisioningOverview());
  } catch (error) {
    next(error);
  }
};

export const internalListOrganizations: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await listProvisionedOrganizations(
        internalListQuerySchema.parse(req.query),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const internalListInvitations: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await listProvisioningInvitations(
        internalListQuerySchema.parse(req.query),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const internalIssueInvitation: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res
      .status(201)
      .json(
        await issueOrganizationInvitation(
          issueInvitationCommandSchema.parse(req.body),
        ),
      );
  } catch (error) {
    next(error);
  }
};

export const internalRenewInvitation: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res
      .status(201)
      .json(
        await renewOrganizationInvitation(
          recordId(req.params),
          renewInvitationCommandSchema.parse(req.body),
        ),
      );
  } catch (error) {
    next(error);
  }
};

export const internalRevokeInvitation: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await revokeOrganizationInvitation(
        recordId(req.params),
        internalCommandSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const internalUpdateOrganizationStatus: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await updateProvisionedOrganizationStatus(
        recordId(req.params),
        updateOrganizationStatusCommandSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const internalRevokeOrganizationSessions: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await revokeProvisionedOrganizationSessions(
        recordId(req.params),
        internalCommandSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};
