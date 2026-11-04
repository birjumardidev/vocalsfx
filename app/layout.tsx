import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VocalsFX — Find the sound in your voice",
  description:
    "Record a vocal sound effect and find real-world sounds with a similar feel.",
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
