import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

const body = Figtree({ variable: "--font-body", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Roots",
  description: "Madplan og indkøbsliste",
  appleWebApp: { capable: true, title: "Roots", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#131611" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
