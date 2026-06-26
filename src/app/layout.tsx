import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";
import Faithbot from "@/components/Faithbot";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "Word of Faith Schools",
  description: "Word of Faith Schools - Nurturing the spirit, body, and soul.",
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
          <ErrorBoundary>
            <Faithbot />
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
