import { createFileRoute, Link } from "@tanstack/react-router";
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
import { VoicemailIcon } from "lucide-react";
import { signIn, useSession } from "../lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { Composer, type ComposeReply } from "@/components/composer";
import { InboxTiles } from "@/components/inbox-tiles";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";

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
    setTestAccounts((current) => [
      ...current,
      makeTestAccount(current.length + 1),
    ]);
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
  /* Palette search covers the accounts whose panes are on screen — the
     reader can only open messages for panes in scope. */
  const scopedAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => scopeIds.includes(a.accountId)),
    [allAccounts, scopeIds],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* null = closed; { reply: null } = blank compose; { reply } = prefilled. */
  const [compose, setCompose] = useState<{ reply: ComposeReply | null } | null>(
    null,
  );
  const openCompose = useCallback(() => setCompose({ reply: null }), []);
  const openReply = useCallback(
    (reply: ComposeReply) => setCompose({ reply }),
    [],
  );

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
      if (e.key === "c") {
        e.preventDefault();
        openCompose();
        return;
      }
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
      <main className="grid min-h-svh w-full place-items-center bg-canvas p-6 text-ink">
        <div className="flex max-w-[400px] flex-col items-center px-6 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-[10px] bg-primary text-on-primary">
            <VoicemailIcon className="size-8" />
          </span>
          <span className="mt-3.5 font-mono text-[15px] font-semibold text-ink">
            Better Mail
          </span>

          <h1 className="mt-7 text-[30px] leading-[1.15] font-semibold tracking-[-1px] text-balance">
            Gmail, at developer speed.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-pretty text-ink-subtle">
            A faster, denser client for all your Google inboxes. Built on the
            Gmail API — not a new email service.
          </p>

          <Button
            className="mt-7 h-10 gap-2.5 rounded-lg px-5 text-sm"
            onClick={() => signIn()}
          >
            <GoogleIcon /> Continue with Google
          </Button>
        </div>

        <footer className="fixed inset-x-0 bottom-[18px] text-center font-mono text-[10.5px] text-ink-tertiary">
          in development
          <span className="px-1.5">·</span>
          <Link to="/privacy" className="transition-colors hover:text-ink-subtle">
            Privacy
          </Link>
        </footer>
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
        onCompose={openCompose}
        onMarkAllRead={markAllRead}
        onAddTestAccount={addTestAccount}
        searchAccounts={scopedAccounts}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accounts={allAccounts ?? []}
      />
      <Composer
        open={compose !== null}
        reply={compose?.reply}
        onOpenChange={(next) => setCompose(next ? { reply: null } : null)}
        accounts={allAccounts ?? []}
      />
      <AppSidebar
        accounts={allAccounts ?? []}
        scopeIds={scopeIds}
        allOn={allOn}
        onToggleScope={toggle}
        onOpenCommand={() => setCmdOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onCompose={openCompose}
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
              onReply={openReply}
            />
          )}
        </div>
      </SidebarInset>
    </>
  );
}

/** Monochrome Google "G", tinted by the button's text color. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      />
    </svg>
  );
}
