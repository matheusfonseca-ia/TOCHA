import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Falow" };

/**
 * Segunda camada do /admin (a primeira é o middleware): sem admin, 404 — a área
 * não existe para quem não é admin. As actions conferem de novo.
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6 lg:px-8">
          <span className="font-display text-lg font-semibold tracking-tight">Admin</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/clientes" className="text-muted-foreground hover:text-foreground">
              Clientes
            </Link>
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              Registro
            </Link>
          </nav>
          <Link href="/dashboard" className="ml-auto text-sm text-muted-foreground underline hover:text-foreground">
            Voltar ao painel
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 pb-12 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
