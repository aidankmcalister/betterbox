import {
  createFileRoute,
  Navigate,
  Outlet,
  redirect,
  useLocation,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MailIcon, PenLineIcon, SearchIcon } from "lucide-react";
import { useAccountScope } from "@/hooks/use-account-scope";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Account } from "@/lib/account";
import { useApplyAccent, useSettings } from "@/hooks/use-settings";
import {
  accountsQueryKey,
  fetchFullEmail,
  isReplyDraft,
  markAllAccountRead,
  useAccountsQuery,
} from "@/lib/mail-queries";
import { toFolder, type Folder } from "@/lib/folders";
import { IS_SELF_HOSTED } from "@/lib/env";
import { makeDemoAccounts, makeTestAccount } from "@/lib/test-account";
import { useSession } from "@/lib/auth/auth-client";
import { fetchSession } from "@/lib/auth/auth-session";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandMenu } from "@/components/shell/command-menu";
import {
  Composer,
  plainToHtml,
  type ComposerContent,
  type ReplyContext,
} from "@/components/editor/composer";
import {
  InboxTiles,
  panelPaneId,
  type Reading,
} from "@/components/mail/inbox-tiles";
import { LandingPage } from "@/components/landing";
import {
  SettingsDialog,
  type PageId,
} from "@/components/settings/settings-dialog";
import {
  OPEN_SNIPPET_DRAFT_EVENT,
  type OpenSnippetDraftDetail,
} from "@/hooks/use-snippets";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_app")({
  // Resolve session in a cached loader, not beforeLoad (which re-runs every nav,
  // adding a 2-5s remote-DB round-trip per open/switch). Loader resolves once for
  // first paint + auth guard; client useSession() gives live updates after.
  loader: async () => {
    const session = await fetchSession();
    // Self-hosted has no marketing layer: unauthenticated → sign-in, not landing.
    if (IS_SELF_HOSTED && !session) {
      throw redirect({ to: "/sign-in" });
    }
    return { session };
  },
  staleTime: Infinity,
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

const DEV_PATHS = new Set(["/pull-requests", "/webhooks", "/api"]);

const EMPTY_COMPOSE: ComposerContent = {
  fromId: null,
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
  reply: null,
};

function AppShell() {
  useApplyAccent();
  const isMobile = useIsMobile();
  const { devTools, demoMode, composerMode } = useSettings();
  // Use the loader's session until the client query settles, so the auth branch
  // is correct on the very first paint.
  const { session: serverSession } = Route.useLoaderData();
  const { data: clientSession, isPending } = useSession();
  const session = isPending ? serverSession : clientSession;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { data: accounts } = useAccountsQuery(!!session);
  const [testAccounts, setTestAccounts] = useState<Account[]>([]);

  // Fresh sign-in: the OAuth callback lands here once a session exists.
  // Invalidate ["accounts"] so the linked primary inbox refetches even if
  // something cached an empty list.
  const signedInUserId = session?.user?.id;
  useEffect(() => {
    if (signedInUserId) {
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
    }
  }, [signedInUserId, queryClient]);

  const addTestAccount = useCallback(() => {
    setTestAccounts((current) => [
      ...current,
      makeTestAccount(current.length + 1),
    ]);
  }, []);

  const isOwner = session?.user.role === "OWNER";
  const onAddTestAccount = isOwner && devTools ? addTestAccount : undefined;

  /* Gated on demoMode alone, not isOwner: reading session role here would flip
     back to real mail for the split second useSession() re-pends. */
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
     pane). Settings stays a local overlay: routing it would reset folder to
     inbox and close the reader. */
  const emailMatch = matchRoute({ to: "/email/$id" });
  const search = location.search as { account?: string; folder?: string };
  const reading: Reading | null =
    emailMatch && search.account
      ? { accountId: search.account, emailId: emailMatch.id }
      : null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ⌘K can deep-link Settings to a specific page (Manage snippets / signatures).
  const [settingsPage, setSettingsPage] = useState<PageId | undefined>(
    undefined,
  );
  // Composer "Save as snippet" hands a body here → open Settings/Snippets pre-filled.
  const [snippetDraft, setSnippetDraft] = useState<string | null>(null);
  useEffect(() => {
    const onDraft = (event: Event) => {
      const detail = (event as CustomEvent<OpenSnippetDraftDetail>).detail;
      if (!detail?.text) return;
      setSnippetDraft(detail.text);
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_SNIPPET_DRAFT_EVENT, onDraft);
    return () => window.removeEventListener(OPEN_SNIPPET_DRAFT_EVENT, onDraft);
  }, []);
  // Integration panels (GitHub PRs, …) the user has dropped onto the board.
  const [openPanels, setOpenPanels] = useState<string[]>([]);
  const togglePanel = useCallback(
    (key: string) =>
      setOpenPanels((panels) =>
        panels.includes(key)
          ? panels.filter((k) => k !== key)
          : [...panels, key],
      ),
    [],
  );
  const closePanelPane = useCallback(
    (paneId: string) =>
      setOpenPanels((panels) =>
        panels.filter((k) => panelPaneId(k) !== paneId),
      ),
    [],
  );

  const folder: Folder = emailMatch
    ? toFolder(search.folder)
    : (PATH_FOLDER[location.pathname] ?? "inbox");
  const folderSearch = folder === "inbox" ? {} : { folder };

  const onDevPage = DEV_PATHS.has(location.pathname);

  // biome-ignore lint/correctness/useExhaustiveDependencies: folderSearch is derived from folder; depend on folder so the link rebuilds when the folder changes.
  const openEmail = useCallback(
    (accountId: string, emailId: string) =>
      navigate({
        to: "/email/$id",
        params: { id: emailId },
        search: { account: accountId, ...folderSearch },
      }),
    [navigate, folder],
  );
  const closeReader = useCallback(
    () => navigate({ to: FOLDER_PATH[folder] }),
    [navigate, folder],
  );
  const openFolder = useCallback(
    (next: Folder) => navigate({ to: FOLDER_PATH[next] }),
    [navigate],
  );
  const openSettings = useCallback((page?: PageId) => {
    setSettingsPage(page);
    setSettingsOpen(true);
  }, []);
  // ⌘K "Open GitHub …" — add the panel to the board (no-op if already open).
  const openPanel = useCallback(
    (key: string) =>
      setOpenPanels((panels) =>
        panels.includes(key) ? panels : [...panels, key],
      ),
    [],
  );

  const [composeOpen, setComposeOpen] = useState(false);
  /* Composer fields live here (not in Composer) so they survive remounts:
     pane↔popout switches, or pages where the compose pane isn't mounted. */
  const [composeContent, setComposeContent] =
    useState<ComposerContent>(EMPTY_COMPOSE);
  const patchComposeContent = useCallback(
    (patch: Partial<ComposerContent>) =>
      setComposeContent((current) => ({ ...current, ...patch })),
    [],
  );
  // A draft being edited (opened from the Drafts folder).
  const [draftRef, setDraftRef] = useState<{
    accountId: string;
    emailId: string;
  } | null>(null);
  const openCompose = useCallback(() => {
    setComposeContent(EMPTY_COMPOSE);
    setDraftRef(null);
    setComposeOpen(true);
  }, []);
  const editDraft = useCallback(
    async (accountId: string, emailId: string) => {
      // A reply-draft belongs to a thread — open it in the reader, not the composer.
      try {
        const full = await fetchFullEmail(accountId, emailId);
        if (isReplyDraft(full)) {
          openEmail(accountId, emailId);
          return;
        }
        // Seed the composer from the draft (the fetch already happened here).
        setComposeContent({
          fromId: accountId,
          to: full.to ?? "",
          cc: full.cc ?? "",
          bcc: "",
          subject:
            !full.subject || full.subject === "(no subject)"
              ? ""
              : full.subject,
          body: full.bodyHtml ?? (full.body ? plainToHtml(full.body) : ""),
          reply: null,
        });
        setDraftRef({ accountId, emailId });
        setComposeOpen(true);
        return;
      } catch {
        /* fall through — open an empty composer pointed at this draft */
      }
      setComposeContent({ ...EMPTY_COMPOSE, fromId: accountId });
      setDraftRef({ accountId, emailId });
      setComposeOpen(true);
    },
    [openEmail],
  );
  useEffect(() => {
    const onOpenCompose = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as
        | {
            accountId?: string;
            to?: string;
            cc?: string;
            subject?: string;
            /** Plain text (gets escaped) — used by forward. */
            body?: string;
            /** Pre-built HTML (used as-is) — reply-all's quoted body. */
            html?: string;
            reply?: ReplyContext;
          }
        | undefined;
      setComposeContent({
        fromId: detail?.accountId ?? null,
        to: detail?.to ?? "",
        cc: detail?.cc ?? "",
        bcc: "",
        subject: detail?.subject ?? "",
        body: detail?.html ?? (detail?.body ? plainToHtml(detail.body) : ""),
        reply: detail?.reply ?? null,
      });
      setDraftRef(null);
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

  /* Keyboard: ⌘K palette · G then I → inbox (all) · ⌥1–9 → switch account
     (⌥, since ⌘1–9 is browser-reserved for tabs). */
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

  // `booting` covers session fetch + first accounts load: render the shell with
  // skeleton account/user blocks so the sidebar never shows up late.
  const booting = isPending || allAccounts === null;

  if (!session) {
    // The cached loader guard won't re-trigger on client-side sign-out, so
    // handle it here: self-host → sign-in, hosted → marketing landing.
    if (IS_SELF_HOSTED) return <Navigate to="/sign-in" />;
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
        onOpenPanel={openPanel}
        isOwner={isOwner}
        accounts={allAccounts ?? []}
        searchAccounts={scopedAccounts}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accounts={allAccounts ?? []}
        snippetDraft={snippetDraft}
        onSnippetDraftConsumed={() => setSnippetDraft(null)}
        initialPage={settingsPage}
      />
      {/* Pane mode docks the composer in the board (below), but the board isn't
          mounted on dev pages and mobile has no room — fall back to the popout. */}
      {(composerMode === "popout" || onDevPage || isMobile) && (
        <Composer
          open={composeOpen}
          onOpenChange={setComposeOpen}
          accounts={allAccounts ?? []}
          content={composeContent}
          onContentChange={patchComposeContent}
          draft={draftRef}
        />
      )}
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
        onTogglePanel={togglePanel}
        openPanels={openPanels}
        onAddTestAccount={onAddTestAccount}
        loading={booting}
      />
      <SidebarInset className="h-svh min-w-0">
        {/* Mobile chrome: hamburger (sidebar sheet) + search + compose.
            Hidden on md+, where the persistent sidebar is shown. */}
        <header className="flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)] md:hidden">
          <SidebarTrigger className="size-9" />
          <div className="flex items-center gap-2 pl-1">
            <span className="flex size-5.5 items-center justify-center rounded-md bg-primary text-on-primary">
              <MailIcon className="size-3.5" />
            </span>
            <span className="font-mono text-[13px] font-semibold">
              BetterBox
            </span>
          </div>
          <button
            type="button"
            aria-label="Search"
            onClick={() => setCmdOpen(true)}
            className="ml-auto inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <SearchIcon className="size-4.5" />
          </button>
          <button
            type="button"
            aria-label="Compose"
            onClick={openCompose}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PenLineIcon className="size-4.5" />
          </button>
        </header>
        <div className="relative min-h-0 w-full max-w-full flex-1 overflow-hidden">
          {onDevPage ? null : allAccounts === null ? (
            <LoadingScreen label="Loading accounts" fill />
          ) : (
            <InboxTiles
              accounts={allAccounts}
              scopeIds={scopeIds}
              folder={folder}
              reading={reading}
              onOpenEmail={openEmail}
              onEditDraft={editDraft}
              onCloseReader={closeReader}
              onRemovePane={toggle}
              extraPaneIds={openPanels.map(panelPaneId)}
              onClosePanel={closePanelPane}
              compose={
                composerMode === "pane" && !isMobile
                  ? {
                      open: composeOpen,
                      draftRef,
                      content: composeContent,
                      onContentChange: patchComposeContent,
                      onOpenChange: setComposeOpen,
                    }
                  : null
              }
            />
          )}
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster />
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
