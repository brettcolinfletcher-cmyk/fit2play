import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const appSans = Plus_Jakarta_Sans({
  variable: "--font-app-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.fit2perform.com.au"),
  title: "Fit2Perform — Return-to-Sport & Performance Testing",
  description:
    "Objective return-to-play and performance testing for athletes. Force plates, sprint testing, dynamometry and clinical strength testing in one performance dashboard.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Fit2Perform — Return-to-Sport & Performance Testing",
    description:
      "Objective return-to-play and performance testing for high-performance athletes — strength, power, speed and asymmetry in one dashboard.",
    url: "https://www.fit2perform.com.au",
    siteName: "Fit2Perform",
    images: [{ url: "/logo_full_original.png", width: 1200, height: 630 }],
    type: "website",
  },
};

// Without an explicit maximumScale, mobile Safari carries over whatever
// pinch-zoom level was set on the PREVIOUS page across Next.js client-side
// (SPA) navigations — a real page load resets zoom to initial-scale, but a
// pushState-based route change does not. That's what Brett saw: dashboard
// pages loading pre-cropped/zoomed-in until he manually pinched out to reset
// it. Capping maximumScale at 1 makes Safari re-clamp to a real 1:1 fit on
// every navigation instead of persisting stale zoom state. Trade-off: this
// also disables pinch-zoom-in; acceptable here since this is an internal
// clinician/staff tool, not a public content site.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${appSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
