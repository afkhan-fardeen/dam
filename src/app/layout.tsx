import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Main Drive",
  description: "Company file portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased text-[var(--ink)] bg-[var(--bg)]">
        {children}
      </body>
    </html>
  );
}
