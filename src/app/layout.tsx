import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuikT Tool — Shipment Dashboard",
  description:
    "Internal tool: Routing, Label Generator, Bill of Lading, and Amazon SP-API for QuikTea / Quikfoods shipments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
