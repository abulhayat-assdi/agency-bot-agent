import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Meta Ads Intelligence Platform",
  description: "Read-only Meta Ads analytics and AI intelligence for digital marketing agencies."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
