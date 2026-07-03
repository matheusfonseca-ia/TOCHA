"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
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
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 animate-fade-up">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-[inset_0_1px_0_0_rgb(255_255_255/0.15)]">
            <Zap className="h-5 w-5 text-white" fill="currentColor" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            InstaReply
          </h1>
          <p className="text-center text-sm text-muted-foreground">
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
