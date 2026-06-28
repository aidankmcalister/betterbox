import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandMenu } from "@/components/shell/command-menu";
import {
  Composer,
  plainToHtml,
  type ComposerContent,
} from "@/components/editor/composer";
import { InboxTiles, type Reading } from "@/components/mail/inbox-tiles";
import { PullRequestsPage } from "@/components/integrations/pull-requests";
import { Toaster } from "@/components/ui/sonner";
import { useAccountScope } from "@/hooks/use-account-scope";
import { fetchFullEmail, isReplyDraft } from "@/lib/mail-queries";
import type { Folder } from "@/lib/folders";
import { makeDemoAccounts, markTestAccountRead } from "@/lib/test-account";
import { cn } from "@/lib/utils";

import { COL, PulseDot } from "./primitives";

/** Demo walkthrough video for mobile/tablet (live multi-pane demo isn't meaningful
 *  there). Empty → "coming soon" placeholder. Kept in sync with the README video slot. */
const DEMO_VIDEO_URL: string = "/betterbox-demo.mp4";

const isYouTube = (url: string) =>
  url.includes("youtube.com") || url.includes("youtu.be");

/** Normalize a YouTube watch/short/embed URL to its embeddable form. */
function youTubeEmbedUrl(url: string): string {
  const id = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([\w-]{11})/)?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : url;
}

export function Demo() {
  return (
    <section className={cn(COL, "py-10 sm:py-16")}>
      <div className="mb-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <PulseDot />
        live demo · sample data
      </div>
      <div className="hidden rounded-2xl border border-border bg-card p-2.5 md:block">
        <div className="relative h-[680px] overflow-hidden rounded-lg bg-background">
          <LandingDemo />
        </div>
      </div>
      {/* Mobile/tablet: live multi-pane app isn't meaningful at phone widths —
          walkthrough video goes here instead, driven by DEMO_VIDEO_URL; falls
          back to a placeholder until a URL is set. */}
      <div className="rounded-2xl border border-border bg-card p-2.5 md:hidden">
        {DEMO_VIDEO_URL ? (
          isYouTube(DEMO_VIDEO_URL) ? (
            <iframe
              src={youTubeEmbedUrl(DEMO_VIDEO_URL)}
              title="BetterBox walkthrough"
              className="aspect-video w-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              src={DEMO_VIDEO_URL}
              autoPlay
              muted
              loop
              playsInline
              className="aspect-139/90 w-full rounded-lg"
            />
          )
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <PlayIcon className="size-5 translate-x-px text-muted-foreground/70" />
            </span>
            <p className="text-sm text-pretty text-muted-foreground">
              Walkthrough video coming soon.
            </p>
            <p className="font-mono text-[11px] text-muted-foreground/60">
              try it on a desktop for the live demo
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const DEMO_USER = { name: "You", email: "personal@example.com", image: null };
const noop = () => {};

/** The demo slot: a self-contained copy of the real app (sidebar, folders, ⌘K
 *  palette, compose) on two seeded test accounts. Sealed sandbox — overlays
 *  portal here via the `transform` containing block (not <body>), nothing hits
 *  the network or sends, settings disabled. Client-only; theme follows the page. */
export function LandingDemo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const boxRef = useRef<HTMLDivElement>(null);
  // ⌘K only fires while the pointer/focus is inside the demo.
  const activeRef = useRef(false);
  const queryClient = useQueryClient();

  // Bumped after a read-state change to recompute demo accounts + unread counts
  // from the test store.
  const [readVersion, setReadVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild the demo accounts whenever readVersion is bumped (after a sandbox read-state change).
  const accounts = useMemo(() => makeDemoAccounts(), [readVersion]);
  const accountIds = useMemo(
    () => accounts.map((a) => a.accountId),
    [accounts],
  );
  const { scopeIds, allOn, toggle } = useAccountScope(accountIds);

  const [folder, setFolder] = useState<Folder>("inbox");
  const [reading, setReading] = useState<Reading | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  // Which surface fills the demo: the mailbox or a developer page (PRs).
  const [devView, setDevView] = useState<"pull_requests" | null>(null);

  // Picking a folder leaves any dev page; opening a dev page enters it.
  const selectFolder = useCallback((next: Folder) => {
    setDevView(null);
    setFolder(next);
  }, []);
  const openDevPage = useCallback((id: string) => {
    if (id === "pull_requests") setDevView("pull_requests");
  }, []);
  const [draftRef, setDraftRef] = useState<{
    accountId: string;
    emailId: string;
  } | null>(null);
  const [composeContent, setComposeContent] = useState<ComposerContent>({
    fromId: null,
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    reply: null,
  });
  const patchComposeContent = useCallback(
    (patch: Partial<ComposerContent>) =>
      setComposeContent((current) => ({ ...current, ...patch })),
    [],
  );

  const openCompose = useCallback(() => {
    setComposeContent({
      fromId: null,
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      reply: null,
    });
    setDraftRef(null);
    setComposeOpen(true);
  }, []);
  const editDraft = useCallback(async (accountId: string, emailId: string) => {
    // Reply-drafts open the thread (reader + inline reply); new drafts compose.
    try {
      const full = await fetchFullEmail(accountId, emailId);
      if (isReplyDraft(full)) {
        setReading({ accountId, emailId });
        return;
      }
      setComposeContent({
        fromId: accountId,
        to: full.to ?? "",
        cc: full.cc ?? "",
        bcc: "",
        subject:
          !full.subject || full.subject === "(no subject)" ? "" : full.subject,
        body: full.bodyHtml ?? (full.body ? plainToHtml(full.body) : ""),
        reply: null,
      });
      setDraftRef({ accountId, emailId });
      setComposeOpen(true);
      return;
    } catch {
      /* fall through to an empty composer pointed at this draft */
    }
    setComposeContent({
      fromId: accountId,
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      reply: null,
    });
    setDraftRef({ accountId, emailId });
    setComposeOpen(true);
  }, []);

  const scopedAccounts = useMemo(
    () => accounts.filter((a) => scopeIds.includes(a.accountId)),
    [accounts, scopeIds],
  );

  const goInbox = useCallback(() => {
    toggle("all");
    setDevView(null);
    setFolder("inbox");
  }, [toggle]);

  // "Mark all read" in the demo: update the test store, refresh lists, recompute
  // unread counts. Nothing leaves the sandbox.
  const markAccountRead = useCallback(
    (accountId: string) => {
      markTestAccountRead(accountId);
      queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
      setReadVersion((v) => v + 1);
      const email = accounts.find((a) => a.accountId === accountId)?.email;
      toast("Marked all read", { description: email });
    },
    [accounts, queryClient],
  );

  // ⌘K toggles the palette only when the demo is focused, so it never hijacks
  // the rest of the marketing page.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const inside =
        activeRef.current || !!boxRef.current?.contains(document.activeElement);
      if (!inside) return;
      e.preventDefault();
      setCmdOpen((o) => !o);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!mounted) return <DemoLoading />;

  return (
    // Scaled to 80% (inner sized 125% to still fill the frame). The `transform`
    // also makes this the containing block for the `fixed` overlays (compose, ⌘K
    // palette), keeping them inside the demo instead of escaping to the page.
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only gates the demo's ⌘K shortcut; it's a non-essential enhancement with no keyboard equivalent needed.
    <div
      ref={boxRef}
      onMouseEnter={() => (activeRef.current = true)}
      onMouseLeave={() => (activeRef.current = false)}
      className="absolute top-0 left-0 flex h-[125%] w-[125%] origin-top-left scale-[0.8] bg-background text-left text-foreground"
    >
      {/* Inside the scaled box so its fixed positioning is contained here
          (transform → containing block) instead of escaping to the page. */}
      <Toaster position="bottom-right" />
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenSettings={noop}
        onGoFolder={goInbox}
        onCompose={openCompose}
        onMarkAccountRead={markAccountRead}
        accounts={accounts}
        searchAccounts={scopedAccounts}
        container={boxRef}
      />
      <Composer
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        content={composeContent}
        onContentChange={patchComposeContent}
        draft={draftRef}
      />
      <AppSidebar
        embedded
        demoUser={DEMO_USER}
        accounts={accounts}
        scopeIds={scopeIds}
        allOn={allOn}
        folder={folder}
        onFolder={selectFolder}
        onToggleScope={toggle}
        onOpenCommand={() => setCmdOpen(true)}
        onOpenSettings={noop}
        onCompose={openCompose}
        onOpenDevPage={openDevPage}
        activeDevId={devView ?? undefined}
      />
      <div className="flex h-full min-w-0 flex-1 overflow-hidden">
        {devView === "pull_requests" ? (
          <PullRequestsPage demo />
        ) : (
          <InboxTiles
            accounts={accounts}
            scopeIds={scopeIds}
            folder={folder}
            reading={reading}
            onOpenEmail={(accountId, emailId) =>
              setReading({ accountId, emailId })
            }
            onCloseReader={() => setReading(null)}
            onRemovePane={toggle}
            onEditDraft={editDraft}
            portalContainer={boxRef}
          />
        )}
      </div>
    </div>
  );
}

export function DemoLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground/60">
        <PulseDot />
        loading live demo…
      </div>
    </div>
  );
}
