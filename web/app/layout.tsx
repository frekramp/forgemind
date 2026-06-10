import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ForgeMind - autonomous AI agent for your zkLTC stack on LiteForge",
  description:
    "The only AI agent on LitVM that reads your on-chain vault, reasons, acts, and notarizes every decision on-chain. Stack hard money toward the Litecoin halving - on LiteForge.",
};

// Runs before paint: apply the saved theme so there's no light/dark flash on load.
const themeInit = `(function(){try{if(localStorage.getItem('forgemind.theme')==='light')document.documentElement.classList.add('light')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
