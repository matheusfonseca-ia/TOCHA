import { redirect } from "next/navigation";

export default function Home() {
  // O middleware garante sessão; daqui só encaminha para o painel.
  redirect("/dashboard");
}
