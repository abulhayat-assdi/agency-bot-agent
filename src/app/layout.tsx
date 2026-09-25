import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agency AI · Meta Ads",
  description: "Read-only Meta Ads analytics and AI intelligence for digital marketing agencies."
};

// Applies the saved theme before first paint (dark by default) so pages never
// flash the wrong palette.
const themeInitScript = `try{var t=localStorage.getItem("agency-ai-theme");document.documentElement.classList.toggle("dark",t!=="light")}catch(e){document.documentElement.classList.add("dark")}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
