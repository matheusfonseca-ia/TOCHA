import Link from "next/link";
import { MessageCircle, MessageSquareText, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const OPTIONS = [
  {
    href: "/rules/nova/responder-dm",
    icon: MessageSquareText,
    title: "Responder DM",
    description:
      "Responda automaticamente quando alguém te enviar uma mensagem direta.",
    popular: false,
  },
  {
    href: "/rules/nova/responder-comentario",
    icon: MessageCircle,
    title: "Responder Comentário",
    description:
      "Responda automaticamente quando alguém comentar em uma publicação ou reel.",
    popular: true,
  },
];

export default function NovaAutomacaoPage() {
  return (
    <div className="animate-fade-up">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Nova automação
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha o gatilho da automação.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {OPTIONS.map(({ href, icon: Icon, title, description, popular }) => (
          <Link key={href} href={href}>
            <Card className="relative h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
              {popular && (
                <Badge
                  variant="warning"
                  className="absolute right-4 top-4"
                >
                  Popular
                </Badge>
              )}
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-secondary/40">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="mt-4 font-display text-[15px] font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
                  <Zap className="h-3 w-3" />
                  Automação rápida
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
