import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <Sidebar userEmail={user.email ?? ""} />
      <main className="min-h-screen md:ml-60">
        <div className="mx-auto max-w-6xl p-4 pb-12 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
