import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
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
  title: "Nikalas Marani — Book a Visit",
  description: "Book a wine tasting experience at Nikalas Marani winery in Kakheti, Georgia.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers()
  const brandColor = h.get('x-tenant-brand') ?? '#7c1d23'
  const brandHover = h.get('x-tenant-brand-hover') ?? '#9b2429'

  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style>{`:root { --color-brand: ${brandColor}; --color-brand-hover: ${brandHover}; }`}</style>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
