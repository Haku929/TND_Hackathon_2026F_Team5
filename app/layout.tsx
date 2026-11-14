import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";
import "./ui.css";

// 欧文（AI・数字）用。小さいので読み込む。
// 見出しの明朝は、Web フォントを読み込まず、端末の明朝を使う（日本語の Web フォントは 1MB 近くになるため）
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const description =
  "ふだんの言葉で書いた疑問から、近い学問の分野と、その分野を研究している先生が見つかります。";

export const metadata: Metadata = {
  title: {
    default: "問学 | 問いから学問を探す",
    template: "%s | 問学",
  },
  description,
  applicationName: "問学",
  openGraph: {
    title: "問学 | 問いから学問を探す",
    description,
    siteName: "問学",
    locale: "ja_JP",
    type: "website",
  },
};

// viewportFit: cover … 画面の切れ込み（ノッチ）の余白（env(safe-area-inset-*)）を使うために必要
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2e8" },
    { media: "(prefers-color-scheme: dark)", color: "#171512" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} h-full antialiased`}
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
