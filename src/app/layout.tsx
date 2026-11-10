import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";
import Footer from "@/components/Footer";
import Faithbot from "@/components/Faithbot";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "Word of Faith Schools",
  description: "Word of Faith Schools - Nurturing the spirit, body, and soul.",
};

// Next.js 16: viewport must be its own export (metadata.viewport is unsupported).
// Configured with viewportFit cover and scaling bounds for edge-to-edge mobile & iPad displays.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#14532D" },
    { media: "(prefers-color-scheme: dark)", color: "#0A2540" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="light">
          <Navbar />
          <PageTransition>
            {children}
          </PageTransition>
          <Footer />
          <ErrorBoundary>
            <Faithbot />
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
