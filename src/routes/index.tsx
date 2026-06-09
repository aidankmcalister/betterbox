import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccountScope } from "@/hooks/use-account-scope";
import { linkGoogle, signIn, useSession } from "../lib/auth-client";
import { AccountDot } from "@/components/account-dot";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { ModeToggle } from "@/components/mode-toggle";
import { ThreadRow } from "@/components/thread-row";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "@/components/thread-list-states";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/")({
  component: Home,
});

type Email = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet?: string;
  unread?: boolean;
};
type Account = { accountId: string; email: string; unread: number };

function Inbox({ account, dotIndex }: { account: Account; dotIndex: number }) {
  const [emails, setEmails] = useState<Email[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setEmails(null);
    setError(null);
    fetch(`/api/emails?accountId=${account.accountId}&max=50`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setEmails(data.emails ?? []);
      })
      .catch((err: Error) => setError(err.message));
  }, [account.accountId]);

  useEffect(load, [load]);

  const unread = emails?.filter((email) => email.unread).length ?? 0;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex h-[46px] shrink-0 items-center gap-2.5 border-b px-3.5">
        <AccountDot colorIndex={dotIndex} />
        <span className="truncate font-mono text-xs font-medium">
          {account.email || account.accountId}
        </span>
        {emails && (
          <span className="font-mono text-[11px] text-muted-foreground/70">
            {emails.length}
          </span>
        )}
        {unread > 0 && (
          <span className="font-mono text-[11px] font-medium text-primary">
            {unread} new
          </span>
        )}
      </div>
      <ScrollArea className="h-[70vh]">
        {error ? (
          <ErrorState
            detail={`GET /api/emails · ${error}`}
            onRetry={load}
            onReconnect={() => linkGoogle()}
          />
        ) : !emails ? (
          <SkeletonRows />
        ) : emails.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {emails.map((email) => (
              <ThreadRow key={email.id} email={email} dotIndex={dotIndex} />
            ))}
            <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/70">
              <CheckIcon className="size-3" /> 50 most recent · fetched live
              from Gmail
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  );
}

function Inboxes({
  accounts,
  scopeIds,
}: {
  accounts: Account[] | null;
  scopeIds: string[];
}) {
  if (!accounts) {
    return <p className="text-sm text-muted-foreground">Loading accounts…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {accounts.map((account, index) =>
        scopeIds.includes(account.accountId) ? (
          <Inbox key={account.accountId} account={account} dotIndex={index} />
        ) : null,
      )}
    </div>
  );
}

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
        <div className="p-6">
          <Inboxes accounts={accounts} scopeIds={scopeIds} />
        </div>
      </SidebarInset>
    </>
  );
}
