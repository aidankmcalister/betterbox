import {
  createFileRoute,
  Outlet,
  useLocation,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MailIcon } from "lucide-react";
import { useAccountScope } from "@/hooks/use-account-scope";
import type { Account } from "@/lib/account";
import { useApplyAccent, useSettings } from "@/hooks/use-settings";
import {
  accountsQueryKey,
  markAllAccountRead,
  useAccountsQuery,
} from "@/lib/mail-queries";
import { toFolder, type Folder } from "@/lib/folders";
import { makeDemoAccounts, makeTestAccount } from "@/lib/test-account";
import { useSession } from "../lib/auth-client";
import { fetchSession } from "@/lib/auth-session";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { Composer } from "@/components/composer";
import { InboxTiles, type Reading } from "@/components/inbox-tiles";
import { LandingPage } from "@/components/landing";
import { SettingsDialog } from "@/components/settings-dialog";
import { SidebarInset } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_app")({
  // Resolve the session on the server so the first paint already knows whether
  // to show the app or the landing — no authenticated-content flash.
  beforeLoad: async () => ({ session: await fetchSession() }),
  component: AppShell,
});

const FOLDER_PATH = {
  inbox: "/",
  labeled: "/labeled",
  sent: "/sent",
  drafts: "/drafts",
  archived: "/archived",
  spam: "/spam",
  trash: "/trash",
} as const satisfies Record<Folder, string>;

const PATH_FOLDER: Record<string, Folder> = {
  "/": "inbox",
  "/labeled": "labeled",
  "/sent": "sent",
  "/drafts": "drafts",
  "/archived": "archived",
  "/spam": "spam",
  "/trash": "trash",
};

const DEV_PATHS = new Set(["/pull-requests", "/webhooks", "/rules", "/api"]);

function AppShell() {
  useApplyAccent();
  const { devTools, demoMode } = useSettings();
  // The server already resolved the session (beforeLoad); use it until the
  // client query settles so the auth branch is correct on the very first paint.
  const { session: serverSession } = Route.useRouteContext();
  const { data: clientSession, isPending } = useSession();
  const session = isPending ? serverSession : clientSession;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { data: accounts } = useAccountsQuery(!!session);
  const [testAccounts, setTestAccounts] = useState<Account[]>([]);

  const addTestAccount = useCallback(() => {
    setTestAccounts((current) => [
      ...current,
      makeTestAccount(current.length + 1),
    ]);
  }, []);

  const isOwner = session?.user.role === "OWNER";
  const onAddTestAccount = isOwner && devTools ? addTestAccount : undefined;

  /* Gated on demoMode alone — NOT isOwner. The toggle is only reachable from
     the owner-only settings page, but reading session role here would flip back
     to real mail for the split second useSession() re-pends (the flicker). */
  const demoAccounts = useMemo(() => makeDemoAccounts(), []);
  const demo = demoMode;
  const allAccounts = useMemo(() => {
    if (demo) return demoAccounts;
    return accounts === undefined ? null : [...accounts, ...testAccounts];
  }, [demo, demoAccounts, accounts, testAccounts]);
  const accountIds = useMemo(
    () => (allAccounts ?? []).map((account) => account.accountId),
    [allAccounts],
  );
  const { scopeIds, allOn, toggle, only } = useAccountScope(accountIds);
  const scopedAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => scopeIds.includes(a.accountId)),
    [allAccounts, scopeIds],
  );

  /* The reader is URL state (/email/$id?account=… — deep-linkable, docks as a
     pane). Settings is just a local overlay: routing it would change the path,
     reset the folder to inbox, and close the reader, so it stays off the URL. */
  const emailMatch = matchRoute({ to: "/email/$id" });
  const search = location.search as { account?: string; folder?: string };
  const reading: Reading | null =
    emailMatch && search.account
      ? { accountId: search.account, emailId: emailMatch.id }
      : null;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const folder: Folder = emailMatch
    ? toFolder(search.folder)
    : (PATH_FOLDER[location.pathname] ?? "inbox");
  const folderSearch = folder === "inbox" ? {} : { folder };

  const onDevPage = DEV_PATHS.has(location.pathname);

  const openEmail = useCallback(
    (accountId: string, emailId: string) =>
      navigate({
        to: "/email/$id",
        params: { id: emailId },
        search: { account: accountId, ...folderSearch },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, folder],
  );
  const closeReader = useCallback(
    () => navigate({ to: FOLDER_PATH[folder] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, folder],
  );
  const openFolder = useCallback(
    (next: Folder) => navigate({ to: FOLDER_PATH[next] }),
    [navigate],
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<
    { to?: string; subject?: string; body?: string } | undefined
  >(undefined);
  const openCompose = useCallback(() => setComposeOpen(true), []);
  useEffect(() => {
    const onOpenCompose = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as
        | { to?: string; subject?: string; body?: string }
        | undefined;
      setComposeDraft(detail);
      setComposeOpen(true);
    };
    window.addEventListener("open-compose", onOpenCompose);
    return () => window.removeEventListener("open-compose", onOpenCompose);
  }, []);

  const markAccountRead = useCallback(
    async (accountId: string) => {
      await markAllAccountRead(accountId);
      queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
    },
    [queryClient],
  );

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
  }, [accountIds, only, toggle, openCompose]);

  // While session is pending render the static shell and skeleton account/user blocks (sidebar never shows up late). `booting` covers session fetch + first accounts load.
  const booting = isPending || allAccounts === null;

  if (!session) {
    return <LandingPage />;
  }

  return (
    <>
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenSettings={openSettings}
        onGoInbox={() => toggle("all")}
        onCompose={openCompose}
        onMarkAccountRead={markAccountRead}
        onAddTestAccount={onAddTestAccount}
        accounts={allAccounts ?? []}
        searchAccounts={scopedAccounts}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accounts={allAccounts ?? []}
      />
      <Composer
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={allAccounts ?? []}
        initialDraft={composeDraft}
      />
      <AppSidebar
        accounts={allAccounts ?? []}
        scopeIds={scopeIds}
        allOn={allOn}
        folder={folder}
        onFolder={openFolder}
        onToggleScope={toggle}
        onOpenCommand={() => setCmdOpen(true)}
        onOpenSettings={openSettings}
        onCompose={openCompose}
        onAddTestAccount={onAddTestAccount}
        loading={booting}
      />
      <SidebarInset className="min-w-0">
        <div className="h-svh min-h-0 w-full max-w-full overflow-hidden">
          {onDevPage ? null : allAccounts === null ? (
            <LoadingScreen label="Loading accounts" fill />
          ) : (
            <InboxTiles
              accounts={allAccounts}
              scopeIds={scopeIds}
              folder={folder}
              reading={reading}
              onOpenEmail={openEmail}
              onCloseReader={closeReader}
              onRemovePane={toggle}
            />
          )}
          <Outlet />
        </div>
      </SidebarInset>
    </>
  );
}

// `fill` fits a parent container; otherwise covers the viewport.
function LoadingScreen({
  label = "Loading",
  fill = false,
}: {
  label?: string;
  fill?: boolean;
}) {
  return (
    <div
      className={`grid w-full place-items-center bg-background ${
        fill ? "h-full" : "min-h-svh"
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex size-11 animate-pulse items-center justify-center rounded-[10px] bg-primary text-on-primary">
          <MailIcon className="size-6" />
        </span>
        <span className="font-mono text-[11px] tracking-wide text-ink-tertiary">
          {label}…
        </span>
      </div>
    </div>
  );
}
