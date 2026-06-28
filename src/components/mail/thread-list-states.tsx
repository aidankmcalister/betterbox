import { InboxIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Density } from "@/components/mail/thread-row";
import type { Folder } from "@/lib/folders";

/** Loading: skeleton rows fading down. */
export function SkeletonRows({
  density = "comfortable",
  count = 9,
}: {
  density?: Density;
  count?: number;
}) {
  const height = density === "compact" ? "h-[34px]" : "h-[60px]";
  return (
    <div role="status" aria-label="Loading messages">
      {Array.from({ length: count }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count skeleton rows, never reordered.
          key={i}
          className={`flex items-center gap-2.5 border-b border-border px-3.5 ${height}`}
          style={{ opacity: 1 - i * 0.09 }}
        >
          <Skeleton className="size-[7px] shrink-0 rounded-full bg-accent" />
          <Skeleton className="h-[9px] w-24 shrink-0 rounded bg-accent" />
          <Skeleton className="h-[9px] flex-1 rounded bg-muted" />
          <Skeleton className="h-2 w-[30px] shrink-0 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Error: replaces today's silent empty list. Models the real 401 failure. */
export function ErrorState({
  detail = "GET /gmail/v1/users/me/messages · request failed",
  onRetry,
  onReconnect,
}: {
  detail?: string;
  onRetry?: () => void;
  onReconnect?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-label-red/15">
        <TriangleAlertIcon className="size-[17px] text-label-red" />
      </span>
      <span className="text-[13.5px] font-semibold text-foreground">
        Couldn’t reach Gmail
      </span>
      <span className="max-w-full font-mono text-[11px] break-all text-muted-foreground/70">
        {detail}
      </span>
      <span className="max-w-[300px] text-[12.5px] leading-normal text-muted-foreground">
        The request for this account failed. Retry, or reconnect the account if
        its access expired.
      </span>
      <div className="mt-1.5 flex gap-2">
        <Button size="sm" onClick={onRetry}>
          <RefreshCwIcon data-icon="inline-start" /> Retry
        </Button>
        <Button size="sm" variant="outline" onClick={onReconnect}>
          Reconnect account
        </Button>
      </div>
    </div>
  );
}

const FOLDER_EMPTY: Record<Folder, { title: string; sub: string }> = {
  inbox: {
    title: "Nothing in your inbox",
    sub: "New mail shows up here the moment Gmail has it.",
  },
  labeled: {
    title: "No labeled mail",
    sub: "Tag a message and it’s grouped here by tag.",
  },
  sent: { title: "Nothing sent", sub: "Messages you send appear here." },
  drafts: { title: "No drafts", sub: "Unsent drafts appear here." },
  archived: {
    title: "Nothing archived",
    sub: "Messages you archive out of the inbox appear here.",
  },
  spam: { title: "No spam", sub: "Messages Gmail flags as spam appear here." },
  trash: {
    title: "Trash is empty",
    sub: "Deleted messages stay here until Gmail purges them.",
  },
};

/** Empty: a successful fetch with zero results — distinct from error. */
export function FolderEmptyState({ folder = "inbox" }: { folder?: Folder }) {
  const copy = FOLDER_EMPTY[folder];
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted">
        <InboxIcon className="size-[17px] text-muted-foreground/70" />
      </span>
      <span className="text-[13.5px] font-semibold text-foreground">
        {copy.title}
      </span>
      <span className="text-[12.5px] text-muted-foreground">{copy.sub}</span>
    </div>
  );
}
