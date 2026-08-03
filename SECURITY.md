# Security Hardening Checklist

This app stores invoice, customer, GST, address, bank, and business profile data. Treat every deployment as sensitive.

## Implemented Controls

- Authentication: invoice, draft, settings, reference-data, CSV export, and database tools are protected behind an admin session when `AUTH_REQUIRED=true`.
- Session safety: sessions use HTTP-only cookies, configurable `SameSite`, secure cookies in production, and an in-memory CSRF token returned only after authentication.
- CSRF protection: all `POST`, `PUT`, `PATCH`, and `DELETE` API requests require `X-CSRF-Token`.
- CORS: only configured `CLIENT_ORIGIN` values are allowed in production.
- Transport: production startup requires HTTPS frontend origins and secure cookies.
- MongoDB safety: production startup rejects localhost MongoDB URIs.
- Destructive action guard: `DELETE /api/settings/database` is disabled unless `ALLOW_DATABASE_RESET=true`.
- Payload limits: JSON body size is bounded by `REQUEST_BODY_LIMIT`; logo upload is also schema-limited.
- Input validation: invoice payloads, query filters, path params, settings, and logo uploads are parsed with strict Zod schemas.
- CSV injection protection: exported CSV cells that could become spreadsheet formulas are neutralized.
- Data leakage reduction: API responses are marked `no-store`; production logs avoid URL/query/body data.
- Error safety: unexpected server/parser/CORS errors return generic messages.

## Required Production Environment

Set these on the backend host:

```bash
NODE_ENV=production
MONGODB_URI=<mongodb-atlas-uri>
MONGODB_DB_NAME=<production-db-name>
MONGODB_IP_FAMILY=4
CLIENT_ORIGIN=https://<frontend-domain>
AUTH_REQUIRED=true
ADMIN_USERNAME=<admin-user>
ADMIN_PASSWORD=<strong-unique-password-12+-chars>
SESSION_SECRET=<32+-char-random-secret>
SESSION_TTL_MINUTES=480
TRUST_PROXY=true
COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=none
ALLOW_DATABASE_RESET=false
REQUEST_BODY_LIMIT=2mb
```

For same-domain deployments, `SESSION_COOKIE_SAMESITE=lax` is also acceptable.

Set this on the frontend host:

```bash
VITE_API_URL=https://<backend-domain>/api
```

## Atlas Controls

- Use MongoDB Atlas with TLS enabled.
- Use a dedicated database user for this app only.
- Grant the app user only the roles it needs for the selected database.
- Prefer IP allowlisting for the backend host where possible.
- Keep `MONGODB_URI` only in the hosting provider's secret environment variables.
- Enable backups before production use.

## Operational Rules

- Do not commit `.env` or credentials.
- Rotate `ADMIN_PASSWORD`, `SESSION_SECRET`, and MongoDB credentials after any suspected exposure.
- Do not enable `ALLOW_DATABASE_RESET=true` in production except during a controlled maintenance window.
- Use HTTPS only for public frontend and backend URLs.
- Review dependency audit output before each production release.
- Consider a managed session store such as Redis or Mongo-backed sessions before running multiple backend instances.
