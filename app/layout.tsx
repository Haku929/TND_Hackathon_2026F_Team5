import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import "./ui.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "問いの星図 | 埋め込みモデル検証",
  description: "multilingual-e5-small によるブラウザ内埋め込みの検証",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="ui-sitefoot">
          <nav className="ui-sitefoot-in" aria-label="サイトの情報">
            <Link href="/about">このアプリについて</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
