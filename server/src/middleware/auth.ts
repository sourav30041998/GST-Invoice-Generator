import crypto from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { OrganizationModel } from "../models/Organization.js";
import { SessionModel } from "../models/Session.js";
import { UserModel } from "../models/User.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import { ApiError } from "./errorHandler.js";

const SESSION_COOKIE = env.COMPANY_SESSION_COOKIE;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type UserSessionContext = {
  userId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  displayName: string;
  role: "owner";
};

type AuthContext = UserSessionContext & {
  csrfToken: string;
  expiresAt: Date;
};

type SessionRecord = {
  _id: unknown;
  userId: unknown;
  organizationId: unknown;
  csrfToken: string;
  expiresAt: Date;
};

const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

function sessionSecret() {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required");
  }
  return env.SESSION_SECRET;
}

function hashToken(value: string) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(value)
    .digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function safeDecodeCookiePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function parseCookies(req: Request) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        return [
          safeDecodeCookiePart(part.slice(0, index)),
          safeDecodeCookiePart(part.slice(index + 1)),
        ];
      }),
  );
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.SESSION_COOKIE_SAMESITE,
    path: "/",
    maxAge: env.SESSION_TTL_MINUTES * 60 * 1000,
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.SESSION_COOKIE_SAMESITE,
    path: "/",
  });
}

function expiryDate() {
  return new Date(Date.now() + env.SESSION_TTL_MINUTES * 60 * 1000);
}

function userResponse(context: AuthContext) {
  return {
    id: context.userId,
    email: context.email,
    displayName: context.displayName,
    role: context.role,
  };
}

async function createSession(
  context: Omit<AuthContext, "csrfToken" | "expiresAt">,
) {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = expiryDate();
  await SessionModel.create({
    tokenHash: hashToken(token),
    userId: context.userId,
    organizationId: context.organizationId,
    csrfToken,
    expiresAt,
  });
  return { token, csrfToken, expiresAt };
}

async function readSession(req: Request): Promise<AuthContext | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = (await SessionModel.findOne({ tokenHash: hashToken(token) })
    .select("+csrfToken")
    .lean()) as SessionRecord | null;
  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const user = await UserModel.findOne({
    _id: session.userId,
    organizationId: session.organizationId,
    status: "active",
  }).lean();
  if (!user) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const organization = await OrganizationModel.findOne({
    _id: user.organizationId,
    status: "active",
  }).lean();
  if (!organization) {
    return null;
  }

  return {
    userId: String(user._id),
    organizationId: String(user.organizationId),
    organizationName: organization.name,
    email: user.email,
    displayName: user.displayName || user.email,
    role: "owner",
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
}

async function extendSession(
  req: Request,
  res: Response,
  context: AuthContext,
) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) {
    return;
  }

  const expiresAt = expiryDate();
  await SessionModel.updateOne(
    { tokenHash: hashToken(token), userId: context.userId },
    { $set: { expiresAt } },
  );
  context.expiresAt = expiresAt;
  setSessionCookie(res, token);
}

function authResponse(context: AuthContext | null) {
  return {
    authRequired: true,
    authenticated: Boolean(context),
    user: context ? userResponse(context) : null,
    organization: context
      ? {
          id: context.organizationId,
          name: context.organizationName,
          role: context.role,
        }
      : null,
    csrfToken: context?.csrfToken || null,
    sessionExpiresAt: context ? context.expiresAt.toISOString() : null,
  };
}

export async function sendUserSession(
  res: Response,
  context: UserSessionContext,
) {
  const session = await createSession(context);
  setSessionCookie(res, session.token);
  res.json(
    authResponse({
      ...context,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    }),
  );
}

export function getAuthContext(res: Response) {
  const context = res.locals.authContext as AuthContext | undefined;
  if (!context) {
    throw new ApiError(401, "Authentication required");
  }
  return context;
}

export const authStatus: RequestHandler = async (req, res, next) => {
  try {
    const context = await readSession(req);
    res.json(authResponse(context));
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const credentials = loginSchema.parse(req.body);
    const user = await UserModel.findOne({
      email: credentials.email,
      status: "active",
    }).select("+passwordHash");

    const validPassword = user
      ? await verifyPassword(credentials.password, user.passwordHash)
      : await hashPassword(credentials.password).then(() => false);
    if (!user || !validPassword) {
      throw new ApiError(401, "Invalid email or password");
    }

    const organization = await OrganizationModel.findOne({
      _id: user.organizationId,
      status: "active",
    }).lean();
    if (!organization) {
      throw new ApiError(401, "Invalid email or password");
    }

    await SessionModel.deleteMany({ userId: user._id });
    user.lastLoginAt = new Date();
    await user.save();
    await sendUserSession(res, {
      userId: String(user._id),
      organizationId: String(user.organizationId),
      organizationName: organization.name,
      email: user.email,
      displayName: user.displayName || user.email,
      role: "owner",
    });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    await SessionModel.deleteOne({ tokenHash: hashToken(token) });
  }
  clearSessionCookie(res);
  res.status(204).send();
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const context = await readSession(req);
    if (!context) {
      throw new ApiError(401, "Authentication required");
    }

    await extendSession(req, res, context);
    res.locals.authContext = context;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireCsrf: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const context = res.locals.authContext as AuthContext | undefined;
  const csrfToken = req.get("x-csrf-token") || "";
  if (!context || !csrfToken) {
    next(new ApiError(403, "Invalid security token"));
    return;
  }

  const expected = Buffer.from(context.csrfToken);
  const actual = Buffer.from(csrfToken);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    next(new ApiError(403, "Invalid security token"));
    return;
  }

  next();
};
