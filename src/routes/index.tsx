import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAccountScope } from "@/hooks/use-account-scope";
import { signIn, useSession } from "../lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { InboxTiles } from "@/components/inbox-tiles";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: Home,
});

type Account = { accountId: string; email: string; unread: number };

function Home() {
  const { data: session, isPending } = useSession();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []));
  }, [session]);

  const accountIds = useMemo(
    () => (accounts ?? []).map((account) => account.accountId),
    [accounts],
  );
  const { scopeIds, allOn, toggle } = useAccountScope(accountIds);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative grid min-h-screen place-items-center p-6">
        <div className="absolute top-4 right-4">
          <ModeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Better Mail</CardTitle>
            <CardDescription>Sign in to view your inboxes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => signIn()}>
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
      <AppSidebar
        accounts={accounts ?? []}
        scopeIds={scopeIds}
        allOn={allOn}
        onToggleScope={toggle}
        onOpenCommand={() => setCmdOpen(true)}
      />
      <SidebarInset>
        <div className="h-svh min-h-0 overflow-hidden">
          {accounts === null ? (
            <p className="p-6 text-sm text-muted-foreground">
              Loading accounts…
            </p>
          ) : (
            <InboxTiles
              accounts={accounts}
              scopeIds={scopeIds}
              onRemovePane={toggle}
            />
          )}
        </div>
      </SidebarInset>
    </>
  );
}
