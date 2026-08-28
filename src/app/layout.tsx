import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { SiteHeader } from "@/components/nav/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineMood",
  description: "Pick a film a whole group will actually enjoy, in under a minute.",
  appleWebApp: {
    title: "CineMood",
    statusBarStyle: "black-translucent",
  },
};

// Dark-only (see project-overview.md UI/UX) - one theme-color, no media variants.
export const viewport: Viewport = {
  themeColor: "#08070f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">
          <SiteHeader />
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
