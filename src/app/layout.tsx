import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Company assets",
  description: "Loveboo and Seissense brand assets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} h-full`}
      data-theme="assethub"
    >
      <body className="min-h-full font-mono antialiased bg-base-100 text-base-content font-light">
        {children}
      </body>
    </html>
  );
}
