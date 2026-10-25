import type { createAdminClient } from "@/lib/supabase/admin";
import { findUserIdByEmail, inviteUser } from "@/lib/auth/invite";
import { getStripe } from "@/lib/billing/stripe";
import type { StripeEventDeps } from "@/lib/billing/stripe-events";

type Admin = ReturnType<typeof createAdminClient>;

export function stripeEventDeps(admin: Admin): StripeEventDeps {
  const stripe = getStripe();
  return {
    admin,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    findUserIdByEmail: (email) => findUserIdByEmail(admin, email),
    inviteUser: (email) => inviteUser(admin, email),
  };
}
