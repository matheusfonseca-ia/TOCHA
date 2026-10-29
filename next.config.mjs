/**
 * Cabeçalhos de segurança de todas as respostas do app (painel, login, admin,
 * definir-senha e APIs). Sem `script-src` na CSP de propósito: o next-themes
 * injeta um script inline antes da hidratação e uma CSP de script sem nonce
 * quebraria o tema. A CSP aqui só trava o que não depende disso: ninguém
 * embute o painel em iframe (clickjacking), sem <object>/<embed> e sem <base>
 * de outra origem.
 *
 * HSTS sem includeSubDomains/preload: o header sai em falow.app.br e valeria
 * para todos os subdomínios; ligar isso (e o preload) é decisão da zona na
 * Cloudflare (SSL/TLS → Edge Certificates), depois de conferir cada subdomínio.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microfone só da própria origem: o composer do CRM grava áudio.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // O app mora em falow.app.br/sistema; a raiz é a landing (outro site).
  // Tem que bater com BASE_PATH em src/lib/app-url.ts.
  basePath: "/sistema",
  poweredByHeader: false,
  experimental: {
    // Anexo do composer do CRM (PDF até 25MB) sobe por server action; o
    // padrão do Next é 1MB e barraria qualquer foto de celular. O limite é
    // global (vale também para as actions públicas de /login e
    // /definir-senha): baixá-lo exige tirar o upload da server action (URL
    // assinada do Storage). Até lá, limite o corpo dos POSTs de /sistema/login
    // e /sistema/definir-senha numa regra de WAF da Cloudflare.
    serverActions: { bodySizeLimit: "26mb" },
    // Desde o Next 15.5 o corpo que passa pelo middleware é cortado em 10MB
    // por padrão; o anexo do composer passa pelo middleware (matcher pega
    // tudo), então o teto acompanha o bodySizeLimit acima.
    proxyClientMaxBodySize: "26mb",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "graph.facebook.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
