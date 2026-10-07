import type { Metadata } from "next";
import { Anybody, Atkinson_Hyperlegible_Next, Martian_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const anybody = Anybody({ variable: "--font-anybody", subsets: ["latin"], axes: ["wdth"] });
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const martian = Martian_Mono({ variable: "--font-martian", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "JobsMarket", template: "%s | JobsMarket" },
  description:
    "Upload your CV, see live roles scored the way a recruiter reads them, and build application documents where every claim traces back to your CV.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anybody.variable} ${atkinson.variable} ${martian.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
