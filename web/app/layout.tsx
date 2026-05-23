import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cat Printer",
  description: "Print images to GB0X / SC03 Bluetooth thermal printers via Web Bluetooth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
