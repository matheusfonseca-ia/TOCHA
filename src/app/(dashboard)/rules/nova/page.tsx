import Link from "next/link";
import { MessageCircle, MessageSquareText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const OPTIONS = [
  {
    href: "/rules/nova/responder-dm",
    icon: MessageSquareText,
    title: "Responder DM",
    description:
      "Responda automaticamente quando alguém te enviar uma mensagem direta.",
  },
  {
    href: "/rules/nova/responder-comentario",
    icon: MessageCircle,
    title: "Responder Comentário",
    description:
      "Responda automaticamente quando alguém comentar em uma publicação ou reel.",
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
        {OPTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
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
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
