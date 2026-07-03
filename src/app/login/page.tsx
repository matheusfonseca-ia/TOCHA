import { LoginForm } from "@/components/auth/login-form";
import { isSignupOpen } from "@/lib/config";

// Verifica a cada request se já existe alguém cadastrado — assim que a
// primeira conta é criada, a aba de cadastro some para sempre.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  return <LoginForm signupEnabled={await isSignupOpen()} />;
}
