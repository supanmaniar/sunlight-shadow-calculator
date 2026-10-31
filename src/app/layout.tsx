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
  title: "Sunlight & Shadow Calculator — 3D sun and shadow simulator",
  description:
    "Visualize real sunlight and shadow conditions in 3D for any place and moment. Plan photos, events, and trips around the sun.",
  applicationName: "Sunlight & Shadow Calculator",
  keywords: [
    "sunlight",
    "shadow",
    "sun position",
    "golden hour",
    "3D map",
    "photography planning",
  ],
  openGraph: {
    title: "Sunlight & Shadow Calculator",
    description:
      "Visualize real sunlight and shadow conditions in 3D for any place and moment.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
