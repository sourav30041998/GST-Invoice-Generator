# GST Invoice Generator

A full-stack GST invoicing application for hospitality billing. The UI preserves the original single-page invoice generator experience while moving invoices, settings, counters, and logo metadata into MongoDB through a Node.js and Express API.

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
4. Start both apps with `npm run dev`.

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:5050`.

## Core Workflows

- Create GST invoices with line-item tax presets, adjustments, amount-in-words, and PDF download.
- Store invoices, preset settings, logo data, counters, and cancellation state in MongoDB.
- Browse invoice history, filter by date, GST status, status, or search term.
- Re-download, edit, cancel, and export invoice records.
- Upload business preset JSON and logo from the settings view.

## Branching Strategy

- `main` remains the stable integration branch.
- Feature work uses `codex/<short-feature-name>`.
- Production fixes should use `hotfix/<short-fix-name>`.
- Work is reviewed through pull requests before merging into `main`.

## Production Security

Before deployment, review [SECURITY.md](./SECURITY.md) and set the required production environment variables for authentication, secure cookies, CORS, MongoDB Atlas, and database-reset controls.

## Free Deployment (Render + MongoDB Atlas)

The production server serves the built React app and API from one origin. This keeps the secure session cookie first-party, so leave `VITE_API_URL` unset for this deployment.

In Render, create a Node **Web Service** from the `main` branch with these values:

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
ADMIN_USERNAME=<admin username>
ADMIN_PASSWORD=<strong unique password>
SESSION_SECRET=<random secret with 32 or more characters>
SESSION_TTL_MINUTES=480
TRUST_PROXY=true
COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
ALLOW_DATABASE_RESET=false
REQUEST_BODY_LIMIT=2mb
```

Render Free services can sleep after inactivity, so users may need to wait for the first request. MongoDB Atlas Free clusters do not include managed backups; export encrypted backups with `mongodump` on a regular schedule.

## GST Rate Notes

The default hotel accommodation presets follow the official GST position identified during the migration: hotel accommodation up to Rs. 7,500 per unit per day is 12%, and above Rs. 7,500 is 18%. Restaurant and non-specified outdoor catering defaults are 5%. Confirm rates with a tax professional before production use.
