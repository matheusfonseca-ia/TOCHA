import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import type { StripeEventDeps } from "@/lib/billing/stripe-events";

type Admin = ReturnType<typeof createAdminClient>;

export function stripeEventDeps(admin: Admin): StripeEventDeps {
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  return {
    admin,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    async findUserIdByEmail(email) {
      const { data, error } = await admin.rpc("falow_user_id_by_email", { p_email: email });
      if (error) throw new Error(`falow_user_id_by_email: ${error.message}`);
      return (data as string | null) ?? null;
    },
    async inviteUser(email) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/definir-senha`,
      });
      if (error || !data.user) throw new Error(`convite falhou: ${error?.message ?? "sem usuário"}`);
      return data.user.id;
    },
  };
}
