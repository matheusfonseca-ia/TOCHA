import { LoginForm } from "@/components/auth/login-form";
import { isSignupEnabled } from "@/lib/config";

// Lê SIGNUP_ENABLED a cada request — trocar a env + reiniciar já
// atualiza a tela, sem precisar de rebuild.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm signupEnabled={isSignupEnabled()} />;
}
