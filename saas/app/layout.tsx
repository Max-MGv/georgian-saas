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

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const displayName = h.get('x-tenant-name') ?? 'Your Winery'
  return {
    title: `${displayName} — Book a Visit`,
    description: `Book a wine tasting experience at ${displayName}.`,
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers()
  const brandColor = h.get('x-tenant-brand') ?? '#7c1d23'
  const brandHover = h.get('x-tenant-brand-hover') ?? '#9b2429'
  const faviconUrl = h.get('x-tenant-favicon')

  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style>{`:root { --color-brand: ${brandColor}; --color-brand-hover: ${brandHover}; }`}</style>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
