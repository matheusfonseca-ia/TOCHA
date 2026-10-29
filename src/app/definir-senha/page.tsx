import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Definir senha · Falow" };

export default async function DefinirSenhaPage(props: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const searchParams = await props.searchParams;
  return <SetPasswordForm tokenHash={searchParams.token_hash ?? ""} type={searchParams.type ?? ""} />;
}
