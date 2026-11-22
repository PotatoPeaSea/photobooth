import type { Metadata, Viewport } from "next";
import { fraunces, inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jason’s Big 24 Photobooth",
  description: "Welcome to Jason’s Big Two Four — 4×6 photobooth prints",
};

export const viewport: Viewport = {
  themeColor: "#0278FF",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
