import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_JP } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
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

// 見出し用の明朝。日本語は字数が多いので、先読みはせず、使う文字だけ読み込む
const notoSerif = Noto_Serif_JP({
  variable: "--font-serif",
  weight: ["500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "問学 | 問いから学問を探す",
  description: "問いから近い学問分野や研究者を探します。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="theme-bootstrap"
          src="/theme-bootstrap.js"
          strategy="beforeInteractive"
        />
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
