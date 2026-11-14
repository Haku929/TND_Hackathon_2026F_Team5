import type { NextConfig } from "next";

const ort =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/";

const csp = [
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: ${ort}`,
  `worker-src 'self' blob:`,
  // 以下は、足しても動作に影響しない（プラグイン・<base>・外部へのフォーム送信・他サイトからの埋め込みを禁じる）
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join(";");

// どの環境でも付ける、基本のセキュリティヘッダー
const securityHeaders = [
  // 配信した種類（Content-Type）を、ブラウザが勝手に推測しない
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 他のサイトの枠（iframe）に埋め込まれない（クリックジャッキング対策。CSP の frame-ancestors と二重に）
  { key: "X-Frame-Options", value: "DENY" },
  // 他のサイトへは、移動先に、このサイトの「場所」（URL の道すじ）を送らない
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 使わない端末の機能を、あらかじめ禁じる
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];
const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // CSP は本番だけ（開発サーバーの更新機能が、CSP に引っかかるため）。基本のヘッダーは、どの環境でも付ける
    const headers =
      process.env.NODE_ENV === "production"
        ? [...securityHeaders, { key: "Content-Security-Policy", value: csp }]
        : securityHeaders;
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
