import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { OAuth2Client } from "google-auth-library";
import express, {
  type Request,
  type Response as ExpressResponse,
  type NextFunction,
} from "express";
import {
  domainConnectSchema,
  gmailCompleteSchema,
  gmailConnectSchema,
  GMAIL_SEND_SCOPE,
  hasOnlySendScopes,
} from "../validation/organizationEmailSchemas.js";
import { sanitizeAuditData } from "./auditSanitization.js";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ||= "test-session-secret-that-is-long-enough";
process.env.INVITATION_TOKEN_SECRET ||=
  "test-invitation-secret-that-is-long-enough";
process.env.PASSWORD_RESET_SECRET ||=
  "test-password-reset-secret-that-is-long-enough";
process.env.ADMIN_INTERNAL_SHARED_SECRET ||=
  "test-admin-shared-secret-that-is-long-enough";
process.env.GOOGLE_EMAIL_CLIENT_ID =
  "email-test-client.apps.googleusercontent.com";
process.env.GOOGLE_EMAIL_CLIENT_SECRET = "test-google-client-secret";

const tenantA = "000000000000000000000001";
const tenantB = "000000000000000000000002";
const owner = "000000000000000000000003";
const identity = {
  senderName: "Example Hotel",
  senderEmail: "bookings@example.com",
};
const domainPayload = {
  ...identity,
  apiKey: "test-key-not-a-real-key-123456",
  password: "test-password",
};
const mail = {
  to: "guest@example.net",
  subject: "Booking confirmation",
  text: "Confirmed",
  html: "<p>Confirmed</p>",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("only send and identity scopes are accepted; mailbox access is rejected", () => {
  assert.equal(hasOnlySendScopes(`openid email ${GMAIL_SEND_SCOPE}`), true);
  assert.equal(
    hasOnlySendScopes(
      `openid https://www.googleapis.com/auth/userinfo.email ${GMAIL_SEND_SCOPE}`,
    ),
    true,
  );
  for (const scope of [
    "gmail.readonly",
    "gmail.modify",
    "gmail.compose",
    "gmail.metadata",
    "gmail.settings.basic",
  ]) {
    assert.equal(
      hasOnlySendScopes(
        `${GMAIL_SEND_SCOPE} https://www.googleapis.com/auth/${scope}`,
      ),
      false,
    );
  }
  assert.equal(hasOnlySendScopes("https://mail.google.com/"), false);
  assert.equal(hasOnlySendScopes("openid email"), false);
});

test("sender schemas reject header injection, provider hosts, tenant overrides and consumer domains", () => {
  assert.equal(domainConnectSchema.safeParse(domainPayload).success, true);
  for (const senderEmail of [
    "a@gmail.com",
    "a@outlook.com",
    "a@localhost",
    "a@127.0.0.1",
    "Name <a@example.com>",
    "a@example.com\r\nBcc: b@example.com",
    "a@example.com,b@example.com",
  ]) {
    assert.equal(
      domainConnectSchema.safeParse({ ...domainPayload, senderEmail }).success,
      false,
      senderEmail,
    );
  }
  assert.equal(
    domainConnectSchema.safeParse({ ...domainPayload, organizationId: tenantB })
      .success,
    false,
  );
  assert.equal(
    domainConnectSchema.safeParse({ ...domainPayload, smtpHost: "127.0.0.1" })
      .success,
    false,
  );
  assert.equal(
    gmailConnectSchema.safeParse({
      senderName: "x\nBcc:evil",
      password: "secret",
    }).success,
    false,
  );
  assert.equal(
    gmailCompleteSchema.safeParse({ code: "code", state: "short" }).success,
    false,
  );
});

test("Google authorization has PKCE, nonce, offline consent and no incremental broadening", async () => {
  const { googleAuthorization } =
    await import("../services/organizationEmailProvider.js");
  const result = await googleAuthorization("test-state", "test-nonce");
  const url = new URL(result.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), "test-state");
  assert.equal(url.searchParams.get("nonce"), "test-nonce");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(hasOnlySendScopes(url.searchParams.get("scope") || ""), true);
  assert.ok(result.codeVerifier.length >= 43);
  assert.equal(result.url.includes(result.codeVerifier), false);
  assert.equal(result.url.includes("test-google-client-secret"), false);
});

test("token exchange requires verified identity, matching nonce, refresh token and narrow scopes", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({}));
  const { exchangeGoogleCode } =
    await import("../services/organizationEmailProvider.js");
  const tokens = {
    id_token: "fake-id",
    refresh_token: "fake-refresh",
    scope: `openid email ${GMAIL_SEND_SCOPE}`,
  };
  const payload = {
    email: "hotel@gmail.com",
    email_verified: true,
    nonce: "nonce",
    sub: "subject",
  };
  t.mock.method(OAuth2Client.prototype, "getToken", (async () => ({
    tokens,
  })) as unknown as typeof OAuth2Client.prototype.getToken);
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", (async () => ({
    getPayload: () => payload,
  })) as unknown as typeof OAuth2Client.prototype.verifyIdToken);
  assert.deepEqual(await exchangeGoogleCode("code", "verifier", "nonce"), {
    senderEmail: "hotel@gmail.com",
    refreshToken: "fake-refresh",
    googleSubject: "subject",
  });
  await assert.rejects(
    exchangeGoogleCode("code", "verifier", "wrong-nonce"),
    /authorization could not be completed/,
  );
  payload.email_verified = false;
  await assert.rejects(exchangeGoogleCode("code", "verifier", "nonce"));
  payload.email_verified = true;
  tokens.scope += " https://www.googleapis.com/auth/gmail.readonly";
  await assert.rejects(exchangeGoogleCode("code", "verifier", "nonce"));
});

test("domain DNS checks reject another domain and require exact sender ownership", async () => {
  const { inspectDomain, verifiedDomainSender } =
    await import("../services/organizationEmailProvider.js");
  const config = {
    domain: "example.com",
    verified: true,
    authenticated: true,
    dns_records: {},
  };
  const seen: string[] = [];
  const fetcher = (async (
    url: string | URL | Request,
    options?: RequestInit,
  ) => {
    seen.push(String(url));
    assert.equal(options?.redirect, "error");
    return json(config);
  }) as typeof fetch;
  assert.equal(
    (await inspectDomain("secret", identity.senderEmail, {}, fetcher))
      .authenticated,
    true,
  );
  assert.deepEqual(seen, [
    "https://api.brevo.com/v3/senders/domains/example.com",
  ]);
  config.domain = "other.example.com";
  await assert.rejects(
    inspectDomain("secret", identity.senderEmail, {}, fetcher),
    /different domain/,
  );
  const senderFetch = (async () =>
    json({
      senders: [{ id: 1, email: "someone@example.com", active: true }],
    })) as typeof fetch;
  assert.equal(
    await verifiedDomainSender("secret", identity, false, senderFetch),
    false,
  );
  assert.equal(
    await verifiedDomainSender("secret", identity, false, (async () =>
      json({
        senders: [{ id: 1, email: identity.senderEmail, active: false }],
      })) as typeof fetch),
    false,
  );
});

test("domain sends use fixed HTTPS transport and only the server-selected sender and recipient", async () => {
  const { sendDomainMail } =
    await import("../services/organizationEmailProvider.js");
  let calls = 0;
  const fetcher = (async (
    url: string | URL | Request,
    options?: RequestInit,
  ) => {
    calls++;
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.sender, {
      email: identity.senderEmail,
      name: identity.senderName,
    });
    assert.deepEqual(body.to, [{ email: mail.to }]);
    assert.equal(body.cc, undefined);
    assert.equal(body.bcc, undefined);
    assert.equal(
      body.attachment[0].content,
      Buffer.from("%PDF-test").toString("base64"),
    );
    return json({ messageId: "accepted-by-provider" }, 201);
  }) as typeof fetch;
  assert.equal(
    await sendDomainMail(
      "api-secret",
      identity,
      {
        ...mail,
        attachments: [
          {
            filename: "receipt.pdf",
            content: Buffer.from("%PDF-test"),
            contentType: "application/pdf",
          },
        ],
      },
      fetcher,
    ),
    "accepted-by-provider",
  );
  assert.equal(calls, 1);
});

test("provider errors never return credentials, recipient details or raw provider bodies", async () => {
  const { sendDomainMail } =
    await import("../services/organizationEmailProvider.js");
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(
      sendDomainMail("DO-NOT-LEAK", identity, mail, (async () => {
        calls++;
        return json({ message: "DO-NOT-LEAK customer@example.com" }, status);
      }) as typeof fetch),
      (error: Error) => !/DO-NOT-LEAK|customer@example.com/.test(error.message),
    );
    assert.equal(calls, 1, "Sends must not automatically retry");
  }
  for (const reason of [
    "dailyLimitExceeded",
    "userRateLimitExceeded",
    "rateLimitExceeded",
  ]) {
    await assert.rejects(
      sendDomainMail("secret", identity, mail, (async () =>
        json({ error: { errors: [{ reason }] } }, 403)) as typeof fetch),
      (error: Error) => "reason" in error && error.reason === "quota",
    );
  }
});

test("email validation rejects unsafe attachments, multiple recipients and large payloads", async () => {
  const { validateOrganizationMail } =
    await import("../services/organizationEmailProvider.js");
  assert.throws(() =>
    validateOrganizationMail({ ...mail, to: "a@example.com,b@example.com" }),
  );
  assert.throws(() =>
    validateOrganizationMail({
      ...mail,
      subject: "Subject\r\nBcc: a@example.com",
    }),
  );
  assert.throws(() =>
    validateOrganizationMail({ ...mail, html: "x".repeat(1_000_001) }),
  );
  assert.throws(() =>
    validateOrganizationMail({
      ...mail,
      attachments: [
        {
          filename: "../secret.pdf",
          content: Buffer.from("x"),
          contentType: "application/pdf",
        },
      ],
    }),
  );
});

test("Gmail sends MIME through the send endpoint only and rechecks connection before submission", async (t) => {
  const { sendGmailMail } =
    await import("../services/organizationEmailProvider.js");
  t.mock.method(OAuth2Client.prototype, "getAccessToken", (async () => ({
    token: "test-access-token",
  })) as unknown as typeof OAuth2Client.prototype.getAccessToken);
  let checked = false;
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(checked, true);
      assert.equal(
        String(url),
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      );
      const raw = JSON.parse(String(options?.body)).raw;
      const mime = Buffer.from(raw, "base64url").toString("utf8");
      assert.match(mime, /From: Example Hotel <bookings@example.com>/);
      assert.match(mime, /Reply-To: Example Hotel <bookings@example.com>/);
      assert.match(mime, /To: guest@example.net/);
      assert.equal(mime.includes("test-access-token"), false);
      return json({ id: "gmail-message-id" });
    },
  );
  assert.equal(
    await sendGmailMail("refresh", identity, mail, async () => {
      checked = true;
    }),
    "gmail-message-id",
  );
  await assert.rejects(
    sendGmailMail("refresh", identity, mail, async () => {
      throw new Error("Disconnected");
    }),
    /Disconnected/,
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("email settings are tenant scoped and never serialize provider credentials", async (t) => {
  const { OrganizationEmailConnectionModel } =
    await import("../models/OrganizationEmailConnection.js");
  const { encryptProtectedJson } =
    await import("../services/dataProtectionService.js");
  const { getOrganizationEmailSettings } =
    await import("../services/organizationEmailService.js");
  let requested: unknown;
  const record = {
    organizationId: tenantA,
    provider: "gmail",
    status: "connected",
    protectedData: encryptProtectedJson("organization-email", tenantA, {
      ...identity,
      refreshToken: "VERY-SECRET",
      apiKey: "API-SECRET",
    }),
  };
  t.mock.method(OrganizationEmailConnectionModel, "findOne", ((
    filter: unknown,
  ) => {
    requested = filter;
    return { select: async () => record };
  }) as unknown as typeof OrganizationEmailConnectionModel.findOne);
  const result = await getOrganizationEmailSettings(tenantA);
  assert.deepEqual(requested, { organizationId: tenantA });
  assert.equal(result.senderEmail, identity.senderEmail);
  assert.equal(
    /VERY-SECRET|API-SECRET|protectedData|refreshToken|apiKey/.test(
      JSON.stringify(result),
    ),
    false,
  );
});

test("OAuth completion binds state to tenant, owner, current session and nonexpired challenge", async (t) => {
  const { EmailOAuthChallengeModel } =
    await import("../models/OrganizationEmailConnection.js");
  const { completeGmailConnection } =
    await import("../services/organizationEmailService.js");
  let requested: Record<string, unknown> = {};
  t.mock.method(EmailOAuthChallengeModel, "findOneAndDelete", ((
    filter: Record<string, unknown>,
  ) => {
    requested = filter;
    return { select: async () => null };
  }) as unknown as typeof EmailOAuthChallengeModel.findOneAndDelete);
  await assert.rejects(
    completeGmailConnection(
      {
        organizationId: tenantB,
        userId: owner,
        csrfToken: "different-session",
        role: "owner",
      },
      "code",
      "s".repeat(43),
    ),
    /another session/,
  );
  assert.equal(requested.organizationId, tenantB);
  assert.equal(requested.userId, owner);
  assert.ok(requested.sessionBinding);
  assert.ok((requested.expiresAt as { $gt: unknown }).$gt instanceof Date);
  assert.notEqual(requested._id, "s".repeat(43));
});

test("disconnected organizations cannot fall back to the platform sender", async (t) => {
  const { OrganizationEmailConnectionModel } =
    await import("../models/OrganizationEmailConnection.js");
  const { sendOrganizationEmail } =
    await import("../services/organizationEmailService.js");
  t.mock.method(OrganizationEmailConnectionModel, "findOne", (() => ({
    select: async () => null,
  })) as unknown as typeof OrganizationEmailConnectionModel.findOne);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not call any provider");
  });
  await assert.rejects(
    sendOrganizationEmail(tenantA, mail),
    /Connect a verified email sender/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("email credentials remain tenant-bound ciphertext and audit values are redacted", async () => {
  const { encryptProtectedJson, decryptProtectedJson } =
    await import("../services/dataProtectionService.js");
  const secret = { refreshToken: "secret-refresh", apiKey: "secret-api" };
  const encrypted = encryptProtectedJson("organization-email", tenantA, secret);
  assert.equal(encrypted.includes("secret"), false);
  assert.throws(() =>
    decryptProtectedJson("organization-email", tenantB, encrypted),
  );
  assert.throws(() => decryptProtectedJson("invoice", tenantA, encrypted));
  assert.deepEqual(sanitizeAuditData(secret), {
    refreshToken: "[REDACTED]",
    apiKey: "[REDACTED]",
  });
});

test("all email-management endpoints require authentication", async () => {
  const { app } = await import("../app.js");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (const [method, suffix] of [
      ["GET", ""],
      ["POST", "/gmail/start"],
      ["POST", "/gmail/complete"],
      ["POST", "/domain"],
      ["POST", "/domain/verify"],
      ["POST", "/test"],
      ["DELETE", ""],
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/organization-email${suffix}`,
        { method },
      );
      assert.equal(response.status, 401, `${method} ${suffix}`);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      await response.body?.cancel();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("email mutations require CSRF and reject tenant identifiers even for authenticated owners", async () => {
  const { requireCsrf } = await import("../middleware/auth.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");
  const { default: router } =
    await import("../routes/organizationEmailRoutes.js");
  const harness = express();
  harness.use(
    express.json(),
    (_req: Request, res: ExpressResponse, next: NextFunction) => {
      res.locals.authContext = {
        organizationId: tenantA,
        userId: owner,
        role: "owner",
        csrfToken: "expected-csrf",
      };
      next();
    },
    requireCsrf,
    router,
    errorHandler,
  );
  const server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (const csrf of ["", "wrong-csrf"]) {
      const result = await fetch(
        `http://127.0.0.1:${address.port}/gmail/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ senderName: "Hotel", password: "test" }),
        },
      );
      assert.equal(result.status, 403);
      await result.body?.cancel();
    }
    const injection = await fetch(`http://127.0.0.1:${address.port}/domain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "expected-csrf",
      },
      body: JSON.stringify({ ...domainPayload, organizationId: tenantB }),
    });
    assert.equal(injection.status, 422);
    await injection.body?.cancel();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("database-backed send limits are tenant separated and reject exhausted windows", async (t) => {
  const { EmailThrottleModel } =
    await import("../models/OrganizationEmailConnection.js");
  const { consumeEmailLimit } =
    await import("../services/organizationEmailService.js");
  const counts = new Map<string, number>();
  t.mock.method(EmailThrottleModel, "findOneAndUpdate", (async (
    filter: { _id: string },
    update: { $setOnInsert: { expiresAt: Date } },
  ) => {
    const count = (counts.get(filter._id) || 0) + 1;
    counts.set(filter._id, count);
    assert.ok(update.$setOnInsert.expiresAt > new Date());
    return { count };
  }) as unknown as typeof EmailThrottleModel.findOneAndUpdate);
  await consumeEmailLimit(tenantA, "test", 1, 60_000);
  await assert.rejects(
    consumeEmailLimit(tenantA, "test", 1, 60_000),
    /Too many email requests/,
  );
  await consumeEmailLimit(tenantB, "test", 1, 60_000);
  assert.equal(counts.size, 2);
});
