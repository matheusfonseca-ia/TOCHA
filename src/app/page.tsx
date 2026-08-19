import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  MessageSquareText,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { FalowLogo, FalowMark } from "@/components/brand/falow-logo";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_PAGES,
} from "@/components/legal/legal-chrome";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Falow — Respostas automáticas para DMs e comentários do Instagram",
  description:
    "Conecte sua conta profissional, crie regras de palavra-chave e sequências de conversa, e deixe o Falow responder as DMs e os comentários sozinho, 24h por dia.",
};

/**
 * Página inicial pública. Antes daqui saía um redirect direto pro painel, o
 * que deixava a raiz do domínio como parede de login — ruim pra quem chega
 * pela primeira vez e ruim na análise da Meta, que abre o domínio do app antes
 * de qualquer coisa. A seção de permissões existe justamente para deixar
 * explícito, em página pública, o que cada permissão faz.
 */

const STEPS = [
  {
    n: "01",
    title: "Conecte a conta",
    body: "Autorize sua conta profissional de Instagram pelo login oficial da Meta. Leva um clique e nenhuma senha passa pelo Falow.",
  },
  {
    n: "02",
    title: "Escreva as regras",
    body: "“Se a mensagem contiver preço, responda com o link da tabela.” Palavra-chave de um lado, resposta do outro.",
  },
  {
    n: "03",
    title: "Deixe rodar",
    body: "A DM chega, o Falow confere as regras, espera alguns segundos pra conversa parecer natural e responde. Tudo fica registrado.",
  },
];

const FEATURES = [
  {
    icon: MessageSquareText,
    title: "Regras de palavra-chave",
    body: "Responde DMs e comentários por palavra-chave, ignorando acento e maiúscula. Cada pessoa recebe a mesma regra só uma vez.",
  },
  {
    icon: Workflow,
    title: "Sequências no canvas",
    body: "Monte fluxos inteiros arrastando blocos: mensagem, botões, respostas rápidas, atraso e espera. A conversa segue sozinha.",
  },
  {
    icon: BarChart3,
    title: "Logs e métricas",
    body: "Toda interação vira registro: o que chegou, qual regra disparou, o que foi respondido e quanto tempo levou.",
  },
];

const PERMISSIONS = [
  {
    scope: "instagram_business_basic",
    body: "Identificar a conta profissional conectada — usuário, id e foto — e manter a autorização válida.",
  },
  {
    scope: "instagram_business_manage_messages",
    body: "Receber as DMs enviadas para a conta e responder a elas com o texto configurado nas regras e sequências.",
  },
  {
    scope: "instagram_business_manage_comments",
    body: "Ler os comentários das publicações da conta e responder publicamente ou por mensagem privada, conforme a regra.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <FalowLogo markClassName="h-7 w-7" textClassName="text-base" />
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
              Automação de DM e comentário no Instagram
            </span>

            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              Sua caixa de entrada responde sozinha.
            </h1>

            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              O Falow conecta sua conta profissional do Instagram, lê as
              mensagens e comentários que chegam e responde com o que{" "}
              <strong className="font-semibold text-foreground">você</strong>{" "}
              escreveu — por palavra-chave ou por fluxos inteiros de conversa.
              24 horas por dia, sem você abrir o app.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">
                  Entrar no painel
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="#como-funciona">Ver como funciona</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section
          id="como-funciona"
          className="scroll-mt-20 border-t border-border bg-card/40"
        >
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Como funciona
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Três passos entre instalar e ver a primeira resposta saindo
              sozinha.
            </p>

            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li
                  key={step.n}
                  className="rounded-xl border border-border bg-background p-6"
                >
                  <span className="font-mono text-xs font-semibold text-primary">
                    {step.n}
                  </span>
                  <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Recursos */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              O que dá pra montar
            </h2>

            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <feature.icon className="h-[18px] w-[18px]" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Permissões e transparência */}
        <section className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  O que o Falow acessa — e o que não acessa
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  A conexão usa o login oficial da Meta e pede exatamente três
                  permissões, cada uma amarrada a uma função do produto.
                </p>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {PERMISSIONS.map((permission) => (
                <li
                  key={permission.scope}
                  className="rounded-xl border border-border bg-background p-5 sm:flex sm:items-start sm:gap-6"
                >
                  <code className="font-mono text-xs font-semibold text-foreground sm:w-72 sm:shrink-0">
                    {permission.scope}
                  </code>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:mt-0">
                    {permission.body}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              O Falow{" "}
              <strong className="font-semibold text-foreground">não</strong>{" "}
              acessa sua lista de seguidores, seu feed, suas conversas antigas,
              seus contatos nem seus dados de pagamento. Não vende dados, não usa
              suas mensagens para treinar modelos de IA e não envia nada fora da
              janela de 24 horas permitida pela Meta. O detalhamento completo
              está na{" "}
              <Link
                className="font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors hover:text-primary"
                href="/privacidade"
              >
                Política de Privacidade
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <FalowMark className="h-7 w-7" />
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {LEGAL_PAGES.map((page) => (
                <Link
                  key={page.href}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  href={page.href}
                >
                  {page.label}
                </Link>
              ))}
              <a
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              >
                Contato
              </a>
            </nav>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Falow — automação de respostas para DMs e comentários do Instagram.
            Dúvidas, pedidos de exclusão de dados ou suporte:{" "}
            <a
              className="font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors hover:text-primary"
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
            . Não somos afiliados à Meta Platforms, ao Instagram nem ao Facebook.
          </p>
        </div>
      </footer>
    </div>
  );
}
