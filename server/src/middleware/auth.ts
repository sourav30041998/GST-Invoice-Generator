import crypto from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "./errorHandler.js";

const SESSION_COOKIE = "qi_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Session = {
  csrfToken: string;
  expiresAt: number;
  user: string;
};

const sessions = new Map<string, Session>();

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
});

function secret() {
  return env.SESSION_SECRET || "development-session-secret";
}

function hmac(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function compareText(left: string, right: string) {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
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
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
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

function pruneExpiredSessions() {
  const now = Date.now();
  sessions.forEach((session, key) => {
    if (session.expiresAt <= now) {
      sessions.delete(key);
    }
  });
}

function readSession(req: Request) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const key = hmac(token);
  const session = sessions.get(key);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }

  return { key, session, token };
}

function authResponse(session: Session | null) {
  return {
    authRequired: env.AUTH_REQUIRED,
    authenticated: !env.AUTH_REQUIRED || Boolean(session),
    user: session?.user || (env.AUTH_REQUIRED ? null : "development"),
    csrfToken: session?.csrfToken || null,
    sessionExpiresAt: session
      ? new Date(session.expiresAt).toISOString()
      : null,
  };
}

export const authStatus: RequestHandler = (req, res) => {
  const record = env.AUTH_REQUIRED ? readSession(req) : null;
  res.json(authResponse(record?.session || null));
};

export const login: RequestHandler = (req, res, next) => {
  try {
    if (!env.AUTH_REQUIRED) {
      res.json(authResponse(null));
      return;
    }

    const credentials = loginSchema.parse(req.body);
    const password = env.ADMIN_PASSWORD || "";
    const validUser = compareText(credentials.username, env.ADMIN_USERNAME);
    const validPassword = compareText(credentials.password, password);

    if (!validUser || !validPassword) {
      throw new ApiError(401, "Invalid username or password");
    }

    pruneExpiredSessions();
    const token = randomToken();
    const session: Session = {
      csrfToken: randomToken(),
      expiresAt: Date.now() + env.SESSION_TTL_MINUTES * 60 * 1000,
      user: env.ADMIN_USERNAME,
    };
    sessions.set(hmac(token), session);
    setSessionCookie(res, token);
    res.json(authResponse(session));
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = (req, res) => {
  const record = env.AUTH_REQUIRED ? readSession(req) : null;
  if (record) {
    sessions.delete(record.key);
  }
  clearSessionCookie(res);
  res.status(204).send();
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!env.AUTH_REQUIRED) {
    next();
    return;
  }

  const record = readSession(req);
  if (!record) {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  record.session.expiresAt = Date.now() + env.SESSION_TTL_MINUTES * 60 * 1000;
  setSessionCookie(res, record.token);
  res.locals.authSession = record.session;
  next();
};

export const requireCsrf: RequestHandler = (req, res, next) => {
  if (!env.AUTH_REQUIRED || SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const session = res.locals.authSession as Session | undefined;
  const csrfToken = req.get("x-csrf-token") || "";
  if (!session || !compareText(csrfToken, session.csrfToken)) {
    next(new ApiError(403, "Invalid security token"));
    return;
  }

  next();
};
