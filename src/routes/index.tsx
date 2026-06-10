import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccountScope } from "@/hooks/use-account-scope";
import type { Account } from "@/lib/account";
import { useApplyAccent } from "@/hooks/use-settings";
import {
  accountsQueryKey,
  emailsQueryKey,
  flattenEmails,
  markEmailsRead,
  useAccountsQuery,
  type EmailsData,
} from "@/lib/mail-queries";
import { makeTestAccount } from "@/lib/test-account";
import { signIn, useSession } from "../lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { InboxTiles } from "@/components/inbox-tiles";
import { ModeToggle } from "@/components/mode-toggle";
import { SettingsDialog } from "@/components/settings-dialog";
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

function Home() {
  useApplyAccent();
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { data: accounts } = useAccountsQuery(!!session);
  const [testAccounts, setTestAccounts] = useState<Account[]>([]);

  const addTestAccount = useCallback(() => {
    setTestAccounts((current) => [...current, makeTestAccount(current.length + 1)]);
  }, []);

  const allAccounts = useMemo(
    () => (accounts === undefined ? null : [...accounts, ...testAccounts]),
    [accounts, testAccounts],
  );
  const accountIds = useMemo(
    () => (allAccounts ?? []).map((account) => account.accountId),
    [allAccounts],
  );
  const { scopeIds, allOn, toggle, only } = useAccountScope(accountIds);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* Mark every fetched unread message in the scoped panes as read, flip the
     cached rows optimistically, then refresh the sidebar unread counts. */
  const markAllRead = useCallback(async () => {
    await Promise.allSettled(
      scopeIds.map(async (accountId) => {
        const data = queryClient.getQueryData<EmailsData>(
          emailsQueryKey(accountId),
        );
        const unreadIds =
          flattenEmails(data)
            ?.filter((e) => e.unread)
            .map((e) => e.id) ?? [];
        if (unreadIds.length === 0) return;
        await markEmailsRead(accountId, unreadIds);
        queryClient.setQueryData<EmailsData>(
          emailsQueryKey(accountId),
          (current) =>
            current && {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                emails: page.emails.map((e) => ({ ...e, unread: false })),
              })),
            },
        );
      }),
    );
    queryClient.invalidateQueries({ queryKey: accountsQueryKey });
  }, [scopeIds, queryClient]);

  /* Keyboard: ⌘K palette · G then I → inbox (all accounts) · ⌥1–9 → switch
     account (⌘1–9 is browser-reserved for tab switching). */
  const lastGPress = useRef(0);
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.closest("input, textarea, [contenteditable='true']") !== null;

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
        return;
      }
      if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
        const id = accountIds[Number(e.code.slice(5)) - 1];
        if (id) {
          e.preventDefault();
          only(id);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "g") {
        lastGPress.current = Date.now();
        return;
      }
      if (e.key === "i" && Date.now() - lastGPress.current < 1000) {
        toggle("all");
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [accountIds, only, toggle]);

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
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onGoInbox={() => toggle("all")}
        onMarkAllRead={markAllRead}
        onAddTestAccount={addTestAccount}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accounts={allAccounts ?? []}
      />
      <AppSidebar
        accounts={allAccounts ?? []}
        scopeIds={scopeIds}
        allOn={allOn}
        onToggleScope={toggle}
        onOpenCommand={() => setCmdOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddTestAccount={addTestAccount}
      />
      <SidebarInset className="min-w-0">
        <div className="h-svh min-h-0 w-full max-w-full overflow-hidden">
          {allAccounts === null ? (
            <p className="p-6 text-sm text-muted-foreground">
              Loading accounts…
            </p>
          ) : (
            <InboxTiles
              accounts={allAccounts}
              scopeIds={scopeIds}
              onRemovePane={toggle}
            />
          )}
        </div>
      </SidebarInset>
    </>
  );
}
