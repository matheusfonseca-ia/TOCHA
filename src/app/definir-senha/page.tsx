import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Definir senha · Falow" };

export default function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: { token_hash?: string; type?: string };
}) {
  return <SetPasswordForm tokenHash={searchParams.token_hash ?? ""} type={searchParams.type ?? ""} />;
}
