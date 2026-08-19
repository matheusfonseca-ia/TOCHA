import { FalowLogo } from "@/components/brand/falow-logo";
import { LegalNav } from "@/components/legal/legal-nav";

/**
 * Casca das três páginas públicas: Política de Privacidade, Exclusão de
 * dados e Termos de Serviço — as URLs cadastradas no painel da Meta, que
 * precisam abrir sem login. O middleware libera as rotas deste grupo.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <FalowLogo markClassName="h-7 w-7" textClassName="text-base" />
          <LegalNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-xs text-muted-foreground">
            Falow — automação de respostas para DMs e comentários do Instagram.
            Não somos afiliados à Meta Platforms, ao Instagram nem ao Facebook.
          </p>
        </div>
      </footer>
    </div>
  );
}
