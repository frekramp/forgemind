import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Distinctive serif display for headings — premium, editorial, warm.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ForgeMind: autonomous AI agent for your zkLTC stack on LiteForge",
  description:
    "The only AI agent on LitVM that reads your on-chain vault, reasons, acts, and notarizes every decision on-chain. Stack hard money toward the Litecoin halving, on LiteForge.",
};

// Dark is the default; only switch to light if explicitly stored. Runs before paint (no flash).
const themeInit = `(function(){try{if(localStorage.getItem('forgemind.theme')!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
