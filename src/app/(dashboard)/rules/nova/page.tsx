import Link from "next/link";
import { ArrowRight, MessageCircle, MessageSquareText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const OPTIONS = [
  {
    href: "/rules/nova/responder-dm",
    icon: MessageSquareText,
    title: "Responder DM",
    description:
      "Responda automaticamente quando alguém te enviar uma mensagem direta.",
    features: ["Palavras-chave", "Links", "Seguir antes"],
  },
  {
    href: "/rules/nova/responder-comentario",
    icon: MessageCircle,
    title: "Responder Comentário",
    description:
      "Responda automaticamente quando alguém comentar em uma publicação ou reel.",
    features: ["Publicação específica", "Resposta pública", "DM de boas-vindas"],
  },
];

// Duas opções só: largura limitada (max-w-3xl) para os cartões não virarem
// retângulos gigantes em monitor largo.
export default function NovaAutomacaoPage() {
  return (
    <div className="max-w-3xl animate-fade-up">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Nova automação
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha o gatilho da automação.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {OPTIONS.map(({ href, icon: Icon, title, description, features }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
              <CardContent className="flex h-full flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-secondary/40">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="mt-4 font-display text-[15px] font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
                <ul className="mt-auto flex flex-wrap gap-1.5 pt-5">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1 text-xs text-muted-foreground"
                    >
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
