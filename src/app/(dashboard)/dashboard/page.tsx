import Link from "next/link";
import { format, subDays } from "date-fns";
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
  const supabase = createClient();

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
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Instagram className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">
                Nenhuma conta conectada
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Conecte uma conta do Instagram para começar a responder DMs
                automaticamente.
              </p>
            </div>
            <Button asChild>
              <Link href="/accounts">Conectar Instagram</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const now = new Date();
  const since30 = subDays(now, 30).toISOString();
  const since14 = subDays(now, 14).toISOString();

  const [receivedRes, repliedRes, contactsRes, seriesRes, recentRes] =
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
      supabase
        .from("interactions")
        .select("created_at, status")
        .in("account_id", accountIds)
        .gte("created_at", since14)
        .limit(5000),
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

  // Série diária dos últimos 14 dias
  const series = (seriesRes.data ?? []) as Pick<
    Interaction,
    "created_at" | "status"
  >[];
  const byDay = new Map<string, { recebidas: number; respondidas: number }>();
  const chartData: ActivityPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = subDays(now, i);
    const key = format(day, "yyyy-MM-dd");
    const point = { recebidas: 0, respondidas: 0 };
    byDay.set(key, point);
    chartData.push({ label: format(day, "dd/MM"), ...point });
  }
  series.forEach((row) => {
    const key = format(new Date(row.created_at), "yyyy-MM-dd");
    const idx = chartData.findIndex(
      (_, i) => format(subDays(now, 13 - i), "yyyy-MM-dd") === key
    );
    if (idx >= 0) {
      chartData[idx].recebidas += 1;
      if (row.status === "replied") chartData[idx].respondidas += 1;
    }
  });

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
          icon={MessageSquare}
        />
        <MetricCard
          index={1}
          label="Respostas enviadas"
          value={replied.toLocaleString("pt-BR")}
          hint="Automações disparadas"
          icon={Send}
        />
        <MetricCard
          index={2}
          label="Taxa de match"
          value={`${matchRate}%`}
          hint="Mensagens que casaram com regras"
          icon={Target}
        />
        <MetricCard
          index={3}
          label="Contatos únicos"
          value={contacts.toLocaleString("pt-BR")}
          hint="Pessoas que enviaram DM"
          icon={Users}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card
          className="stagger-item lg:col-span-3"
          style={{ "--stagger-index": 4 } as React.CSSProperties}
        >
          <CardHeader>
            <CardTitle>Atividade</CardTitle>
            <CardDescription>
              Mensagens recebidas × respondidas (14 dias)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart data={chartData} />
          </CardContent>
        </Card>

        <Card
          className="stagger-item lg:col-span-2"
          style={{ "--stagger-index": 5 } as React.CSSProperties}
        >
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimas interações processadas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma interação ainda. Assim que alguém enviar uma DM, ela
                aparece aqui.
              </p>
            )}
            {recent.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md bg-background/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {item.message_text ?? "(sem texto)"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(item.created_at), "dd MMM, HH:mm", {
                      locale: ptBR,
                    })}
                    {item.matched_keyword && (
                      <>
                        {" · "}
                        <span className="font-mono text-primary">
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
