import { MainArea } from "@/components/layout/main-area";
import { Sidebar } from "@/components/layout/sidebar";
import { logoutAction } from "@/server/auth/actions";
import { getRequestSession } from "@/server/auth/request-context";

interface AppShellProps {
  children: React.ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const session = await getRequestSession().catch(() => null);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar userEmail={session?.user.email ?? null} logoutAction={logoutAction} />
      <div className="lg:pl-72">
        <MainArea>{children}</MainArea>
      </div>
    </div>
  );
}
