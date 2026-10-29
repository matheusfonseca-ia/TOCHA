import Link from "next/link";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Instagram,
  MessageSquare,
  Send,
  Target,
  Users,
} from "lucide-react";

import {
  ActivityChart,
  type ActivityPoint,
} from "@/components/dashboard/activity-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Interaction, InteractionStatus } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("ig_accounts")
    .select("id, ig_username")
    .neq("status", "disconnected");

  const accountIds = (accounts ?? []).map((a) => a.id);

  if (accountIds.length === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Visão geral das suas automações."
        />
        <EmptyState
          icon={Instagram}
          title="Nenhuma conta conectada"
          description="Conecte uma conta do Instagram para começar a responder DMs automaticamente."
        >
          <Button asChild>
            <Link href="/accounts">Conectar Instagram</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const now = new Date();
  const since30 = subDays(now, 30).toISOString();
  // Série diária dos últimos 14 dias: contagem no banco por dia (índice
  // account_id + created_at), em vez de baixar as interactions e somar aqui,
  // o que o teto de 1000 linhas do PostgREST cortava em silêncio.
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(subDays(now, 13 - i)));
  const dayCount = (day: Date, onlyReplied: boolean) => {
    let query = supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .in("account_id", accountIds)
      .gte("created_at", day.toISOString())
      .lt("created_at", addDays(day, 1).toISOString());
    if (onlyReplied) query = query.eq("status", "replied");
    return query.then(({ count }) => count ?? 0);
  };
  const seriesPromise = Promise.all(
    days.map(async (day) => {
      const [recebidas, respondidas] = await Promise.all([dayCount(day, false), dayCount(day, true)]);
      return { label: format(day, "dd/MM"), recebidas, respondidas } satisfies ActivityPoint;
    })
  );

  const [receivedRes, repliedRes, contactsRes, chartData, recentRes] =
    await Promise.all([
      supabase
        .from("interactions")
        .select("*", { count: "exact", head: true })
        .in("account_id", accountIds)
        .gte("created_at", since30),
      supabase
        .from("interactions")
        .select("*", { count: "exact", head: true })
        .in("account_id", accountIds)
        .eq("status", "replied")
        .gte("created_at", since30),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .in("account_id", accountIds),
      seriesPromise,
      supabase
        .from("interactions")
        .select("*")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const received = receivedRes.count ?? 0;
  const replied = repliedRes.count ?? 0;
  const contacts = contactsRes.count ?? 0;
  const matchRate = received > 0 ? Math.round((replied / received) * 100) : 0;

  const recent = (recentRes.data ?? []) as Interaction[];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Últimos 30 dias · ${accounts!.length} conta(s) conectada(s)`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          index={0}
          label="Mensagens recebidas"
          value={received.toLocaleString("pt-BR")}
          hint="DMs processadas pelo webhook"
          icon={<MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
        />
        <MetricCard
          index={1}
          label="Respostas enviadas"
          value={replied.toLocaleString("pt-BR")}
          hint="Automações disparadas"
          icon={<Send className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
        />
        <MetricCard
          index={2}
          label="Taxa de match"
          value={`${matchRate}%`}
          hint="Mensagens que casaram com regras"
          icon={<Target className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
        />
        <MetricCard
          index={3}
          label="Contatos únicos"
          value={contacts.toLocaleString("pt-BR")}
          hint="Pessoas que enviaram DM"
          icon={<Users className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
        />
      </div>

      {/* Em lg (sidebar aberta, ~1040px) o gráfico fica com ~60%; em 2xl (até
          1600px) a coluna da lista ganha largura fixa confortável e o gráfico
          ocupa o resto, ganhando altura para acompanhar as 8 linhas recentes. */}
      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-5 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card
          className="stagger-item flex flex-col lg:col-span-3 2xl:col-span-1"
          style={{ "--stagger-index": 4 } as React.CSSProperties}
        >
          <CardHeader>
            <CardTitle>Atividade</CardTitle>
            <CardDescription>
              Mensagens recebidas × respondidas (14 dias)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <ActivityChart data={chartData} />
          </CardContent>
        </Card>

        <Card
          className="stagger-item lg:col-span-2 2xl:col-span-1"
          style={{ "--stagger-index": 5 } as React.CSSProperties}
        >
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimas interações processadas</CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            {recent.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma interação ainda. Assim que alguém enviar uma DM, ela
                aparece aqui.
              </p>
            )}
            {recent.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-0 2xl:py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {item.message_text ?? "(sem texto)"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {format(new Date(item.created_at), "dd MMM, HH:mm", {
                      locale: ptBR,
                    })}
                    {item.matched_keyword && (
                      <>
                        {" · "}
                        <span className="font-mono">
                          {item.matched_keyword}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <StatusBadge status={item.status as InteractionStatus} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
