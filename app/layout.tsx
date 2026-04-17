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
  title: "Fit2Play — Return-to-Sport Intelligence",
  description:
    "Data-driven return-to-sport testing for athletes. 1080 Sprint, Hawkins force plates, dynamometry and clinical strength testing in one performance dashboard.",
  icons: {
    icon: "/fit2play_logo_symbol.png",
    apple: "/fit2play_logo_symbol.png",
  },
  openGraph: {
    title: "Fit2Play — Return-to-Sport Intelligence",
    description: "Objective return-to-sport testing for high-performance athletes. 1080 Motion and Hawkins force plate data in one performance dashboard.",
    url: "https://fit2play.io",
    siteName: "Fit2Play",
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
