# GST Invoice Generator

Platform administration is maintained and deployed from a separate
`gst-invoice-platform-admin` repository. The company API no longer serves
platform-admin routes.

A full-stack GST invoicing application for hospitality billing. Each account belongs to exactly one private company workspace; invoice, customer, business profile, counter, draft, and audit data is isolated by organization.

## Stack

- Frontend: React, TypeScript, Tailwind CSS, Vite
- Backend: Node.js, Express.js, TypeScript
- Database: MongoDB with Mongoose
- PDF: jsPDF and jsPDF AutoTable
- Version control: feature branches under `codex/`

## Local Setup

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start MongoDB locally, or run `docker compose up -d mongo`.
3. Install dependencies with `npm install`.
4. For a brand-new database, run `npm run db:create-indexes`.
5. Start both apps with `npm run dev`.

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:5050`.

## Core Workflows

- Create GST invoices with charge and service tax presets, adjustments, amount-in-words, and PDF download.
- Create a company owner account, then maintain that company's business profile and invoices.
- Store invoices, preset settings, logo data, counters, drafts, sessions, and cancellation state in MongoDB.
- Browse invoice history, filter by date, GST status, status, or search term.
- Re-download, edit, cancel, and export invoice records.
- Upload business preset JSON and logo from the company profile view.

## Company Isolation

- One owner account belongs to one organization. Company switching and cross-company memberships are intentionally not available.
- Every protected request reads the organization ID from the server-side session, never from the browser request body or URL.
- Invoice numbers are unique per organization, so two companies can both use `INV-202608-0001` without seeing one another's records.
- The company profile and clear-data action affect only the signed-in organization.

See [MULTI_TENANCY.md](./MULTI_TENANCY.md) for the data model, API list, migration procedure, and rollout checklist.

## Closed Access

Company registration is closed. A separate MFA-protected platform administrator creates one-time invitations for approved company owners; only accepting an unexpired invitation activates a company. See [ACCESS_CONTROL.md](./ACCESS_CONTROL.md) and [SERVICE_SEPARATION.md](./SERVICE_SEPARATION.md) for the cross-service contract and operational rules.

## Branching Strategy

- `main` remains the stable integration branch.
- Feature work uses `codex/<short-feature-name>`.
- Production fixes should use `hotfix/<short-fix-name>`.
- Work is reviewed through pull requests before merging into `main`.

## Production Security

Before deployment, review [SECURITY.md](./SECURITY.md) and set the required production environment variables for authentication, secure cookies, CORS, MongoDB Atlas, and database-reset controls.

The next planned hardening stages, including Atlas least-privilege roles, Admin access gating, Redis rate limits, mTLS, passkeys, encryption, monitoring, and incident response, are tracked in [FUTURE_SECURITY_ROADMAP.md](./FUTURE_SECURITY_ROADMAP.md).

## Free Deployment (Render + MongoDB Atlas)

The production server serves the built React app and API from one origin. This keeps the secure session cookie first-party, so leave `VITE_API_URL` unset for this deployment.

In Render, create a Node **Web Service** from the reviewed release branch with these values:

- Build command: `npm ci --include=dev && npm run build && npm run db:create-indexes`
- Start command: `npm start`
- Health check path: `/api/health`
- Instance type: `Free`

Configure the following production environment variables in Render. Keep their values out of Git and out of client-side `VITE_*` variables.

```env
NODE_ENV=production
MONGODB_URI=<MongoDB Atlas connection string>
MONGODB_DB_NAME=gst_invoice_generator
MONGODB_IP_FAMILY=4
CLIENT_ORIGIN=https://<your-render-service>.onrender.com
AUTH_REQUIRED=true
SESSION_SECRET=<random secret with 32 or more characters>
SESSION_TTL_MINUTES=480
INVITATION_TOKEN_SECRET=<shared 32+ character invitation-token secret>
ADMIN_INTERNAL_SHARED_SECRET=<shared 32+ character internal-service secret>
TRUST_PROXY=true
COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
ALLOW_DATABASE_RESET=false
REQUEST_BODY_LIMIT=2mb
```

Before the first deployment of the multi-company branch, follow the one-time migration procedure in [MULTI_TENANCY.md](./MULTI_TENANCY.md). Deploy the separate Platform Admin service only after the Company service is healthy; its own repository documents administrator bootstrap and MFA enrollment.

Render Free services can sleep after inactivity, so users may need to wait for the first request. MongoDB Atlas Free clusters do not include managed backups; export encrypted backups with `mongodump` on a regular schedule.

## GST Rate Notes

The default hotel accommodation presets follow the official GST position identified during the migration: hotel accommodation up to Rs. 7,500 per unit per day is 12%, and above Rs. 7,500 is 18%. Restaurant and non-specified outdoor catering defaults are 5%. Confirm rates with a tax professional before production use.
