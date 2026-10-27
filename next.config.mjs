/** @type {import('next').NextConfig} */
const nextConfig = {
  // O app mora em falow.app.br/sistema; a raiz é a landing (outro site).
  // Tem que bater com BASE_PATH em src/lib/app-url.ts.
  basePath: "/sistema",
  experimental: {
    // Anexo do composer do CRM (PDF até 25MB) sobe por server action; o
    // padrão do Next é 1MB e barraria qualquer foto de celular.
    serverActions: { bodySizeLimit: "26mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "graph.facebook.com" },
    ],
  },
};

export default nextConfig;
