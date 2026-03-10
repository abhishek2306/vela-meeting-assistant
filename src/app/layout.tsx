import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Navigation } from "@/components/Navigation";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Vela — AI Meeting Assistant",
  description: "Your intelligent co-pilot for meetings. Schedule, join, and capture minutes automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ minHeight: "100vh", position: "relative" }}>
        <Providers>
          <Navigation />
          <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
