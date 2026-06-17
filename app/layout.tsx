import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
