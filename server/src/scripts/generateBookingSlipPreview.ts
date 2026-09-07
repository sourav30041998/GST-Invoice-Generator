import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildBookingSlipPdf } from "../services/bookingReceiptPdfService.js";

const outputDirectory = path.resolve(process.cwd(), "output", "pdf");
const outputPath = path.join(outputDirectory, "booking-slip-preview.pdf");

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  outputPath,
  buildBookingSlipPdf({
    businessName: "Seabreeze Heritage Resort",
    businessTagline: "Tajpur - Purba Medinipur - West Bengal",
    businessAddressLines: ["Tajpur, Purba Medinipur", "West Bengal - 721423"],
    businessPhone: "+91 90000 00000",
    businessEmail: "reservations@seabreeze.example",
    businessWebsite: "www.seabreeze.example",
    customerName: "Arjun Sen",
    confirmationNumber: "BKG-2608-0042",
    receiptNumber: "RCT/2026/0042",
    checkinDate: "16 Aug 2026 (12 noon)",
    checkoutDate: "17 Aug 2026 (11 am)",
    guestCount: 8,
    requestedRooms: [
      { roomType: "Family", bedsPerRoom: 4, quantity: 1 },
      { roomType: "Standard", bedsPerRoom: 2, quantity: 2 },
    ],
    amountMinor: 100_000,
    estimatedTotalMinor: 766_500,
    advanceBalanceMinor: 100_000,
    paymentMethod: "upi",
    receivedAt: "2026-08-07T10:30:00.000Z",
    terms:
      "Advance payments are governed by the property's cancellation policy. Changes to travel dates are subject to availability. Statutory taxes may be charged separately. Please present the confirmation number at check-in.",
  }),
);

console.log(outputPath);
