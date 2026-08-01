# GST Invoice Generator

<<<<<<< HEAD
Complete web application to create, manage, and track business GST invoices.

=======
>>>>>>> codex/backend-api-data
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

<<<<<<< HEAD
- `main` remains the stable integration branch.
- Feature work uses `codex/<short-feature-name>`.
- Production fixes should use `hotfix/<short-fix-name>`.
- Work is reviewed through pull requests before merging into `main`.

## GST Rate Notes

The default hotel accommodation presets follow the official GST position identified during the migration: hotel accommodation up to Rs. 7,500 per unit per day is 12%, and above Rs. 7,500 is 18%. Restaurant and non-specified outdoor catering defaults are 5%. Confirm rates with a tax professional before production use.
=======
- `master` remains the stable integration branch.
- Feature work uses `codex/<short-feature-name>`.
- Production fixes should use `hotfix/<short-fix-name>`.
- Work is reviewed through pull requests before merging into `master`.

## GST Rate Notes

The default hotel accommodation presets follow the official GST position identified during the migration: hotel accommodation up to Rs. 7,500 per unit per day is 12%, and above Rs. 7,500 is 18%. Restaurant and non-specified outdoor catering defaults are 5%. Confirm rates with a tax professional before production use.
>>>>>>> codex/backend-api-data
