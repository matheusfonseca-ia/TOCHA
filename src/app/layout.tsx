import type { Metadata } from "next";
import { Sora, Figtree, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Falow — Auto-resposta para DMs do Instagram",
  description:
    "Conecte contas do Instagram, crie regras de palavra-chave e responda DMs automaticamente.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${sora.variable} ${figtree.variable} ${jetbrainsMono.variable} min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
