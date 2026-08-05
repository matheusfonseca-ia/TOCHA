"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FalowMark } from "@/components/brand/falow-logo";
import { FalowPathDecor } from "@/components/brand/falow-path-decor";
import { ThemeToggle } from "@/components/theme-toggle";
import { signIn, signUp, type AuthResult } from "@/app/login/actions";

export function LoginForm({ signupEnabled }: { signupEnabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const action = mode === "signin" ? signIn : signUp;

    startTransition(async () => {
      const result: AuthResult = await action(formData);
      if (result?.error) toast.error(result.error);
      if (result?.message) toast.success(result.message);
    });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <FalowPathDecor className="pointer-events-none absolute -right-24 -top-16 h-[420px] w-[560px] opacity-[0.12] sm:opacity-[0.16]" />
      <FalowPathDecor className="pointer-events-none absolute -bottom-24 -left-24 h-[360px] w-[480px] rotate-180 opacity-[0.08]" />

      <ThemeToggle className="absolute right-4 top-4" />

      <div className="relative w-full max-w-sm space-y-8 animate-fade-up">
        <div className="flex flex-col items-center gap-3">
          <FalowMark className="h-11 w-11" />
          <h1 className="font-display text-2xl font-bold tracking-tight">
            falow
          </h1>
          <p className="text-center text-sm font-medium text-foreground/80">
            Conversas que viram vendas.
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Auto-resposta para DMs do Instagram
          </p>
        </div>

        <Card>
          <CardHeader>
            {signupEnabled ? (
              <Tabs
                value={mode}
                onValueChange={(v) => setMode(v as "signin" | "signup")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>
                <TabsContent value="signin" className="mt-4">
                  <CardTitle className="text-base">Bem-vindo de volta</CardTitle>
                  <CardDescription className="mt-1">
                    Acesse seu painel de automações.
                  </CardDescription>
                </TabsContent>
                <TabsContent value="signup" className="mt-4">
                  <CardTitle className="text-base">Crie sua conta</CardTitle>
                  <CardDescription className="mt-1">
                    O cadastro fecha sozinho depois da primeira conta.
                  </CardDescription>
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <CardTitle className="text-base">Bem-vindo de volta</CardTitle>
                <CardDescription className="mt-1">
                  Acesse seu painel de automações.
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending
                  ? "Aguarde..."
                  : mode === "signin"
                    ? "Entrar"
                    : "Criar conta"}
              </Button>
            </form>
            {!signupEnabled && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                O cadastro de novas contas está desativado nesta instalação.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
