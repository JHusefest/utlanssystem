import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/AuthProvider";
import { Header } from "@/components/Header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Utlånssystem",
  description: "Oversikt og utlån av IT-utstyr",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#171615" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body>
        <AuthProvider>
          <Header />
          <main className="container page">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
