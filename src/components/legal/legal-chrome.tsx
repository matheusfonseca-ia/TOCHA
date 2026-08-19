import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Peças compartilhadas pelas páginas públicas: as duas exigidas pelo painel
 * da Meta (Privacy Policy URL e User Data Deletion) e os Termos de Serviço.
 * Ficam juntas para que nenhuma divirja em data de vigência, contato ou
 * tipografia.
 */

/** Data de vigência mostrada nas páginas. */
export const LEGAL_UPDATED_AT = "18 de agosto de 2026";

/** Rotas públicas — usadas no cabeçalho e no rodapé. */
export const LEGAL_PAGES = [
  { href: "/privacidade", label: "Política de Privacidade" },
  { href: "/exclusao-de-dados", label: "Exclusão de dados" },
  { href: "/termos-de-servico", label: "Termos de Serviço" },
] as const;

/**
 * Contato do responsável pela instalação. Cada instalação do Falow é operada
 * por quem a hospeda, então o e-mail vem de env; sem ele, a página orienta o
 * contato pela própria conta de Instagram atendida pela automação.
 */
export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function LegalList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("list-disc space-y-2 pl-5 marker:text-primary", className)}>
      {children}
    </ul>
  );
}

/** Lista numerada — usada nos passo a passo da página de exclusão. */
export function LegalSteps({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "list-decimal space-y-2 pl-5 marker:font-semibold marker:text-foreground",
        className
      )}
    >
      {children}
    </ol>
  );
}

/** Destaque de termo dentro do texto corrido. */
export function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

/** Caminho de menu do Instagram/painel — visual de "clique aqui, depois ali". */
export function Path({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">
      {children}
    </span>
  );
}

export function LegalLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors hover:text-primary";

  if (external) {
    return (
      <a className={className} href={href} rel="noreferrer noopener" target="_blank">
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

/** Bloco em destaque para avisos que o leitor não pode passar batido. */
export function LegalCallout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-4">
      <p className="mb-1.5 font-display text-sm font-semibold text-foreground">
        {title}
      </p>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

/** Bloco de código (SQL da exclusão manual, no caminho do administrador). */
export function LegalCode({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-xs leading-relaxed text-foreground">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

/**
 * Fecho de contato, com o mesmo texto-base nas três páginas — só o motivo do
 * contato muda (dados, exclusão, dúvidas sobre os termos etc).
 */
export function LegalContact({
  reason = "dúvidas sobre seus dados ou para pedir a exclusão deles",
}: {
  reason?: string;
}) {
  return (
    <p>
      Esta instalação do Falow é operada de forma independente por quem hospeda o
      aplicativo e conectou a conta de Instagram.{" "}
      {LEGAL_CONTACT_EMAIL ? (
        <>
          Para {reason}, escreva para{" "}
          <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </LegalLink>
          . Respondemos em até 7 dias.
        </>
      ) : (
        <>
          Para {reason}, envie uma mensagem direta para a própria conta de
          Instagram atendida por esta automação — é ela que recebe e responde os
          pedidos. Respondemos em até 7 dias.
        </>
      )}
    </p>
  );
}
