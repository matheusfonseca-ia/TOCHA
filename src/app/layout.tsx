import type { Metadata } from "next";
import { Outfit, Figtree, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
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
  title: "Falow — Conversas que viram vendas",
  description:
    "Automação conversacional para o Instagram: conecte contas, crie regras de palavra-chave e sequências que respondem DMs e comentários automaticamente.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${outfit.variable} ${figtree.variable} ${jetbrainsMono.variable} min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
