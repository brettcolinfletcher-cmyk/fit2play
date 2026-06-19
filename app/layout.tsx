import type { Metadata } from "next";
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
