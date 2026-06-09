import { InboxIcon, LoaderIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Density } from "@/components/thread-row";

/** Loading: skeleton rows fading down, with the honest fetch caption. */
export function SkeletonRows({ density = "comfortable" }: { density?: Density }) {
  const height = density === "compact" ? "h-[34px]" : "h-[52px]";
  return (
    <div aria-label="Loading messages">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
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
      <div className="flex items-center justify-center gap-2 p-3.5 font-mono text-[10.5px] text-muted-foreground/70">
        <LoaderIcon className="size-3 animate-spin text-muted-foreground" />
        messages.list · 50 × messages.get
      </div>
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
      <span className="font-mono text-[11px] text-muted-foreground/70">{detail}</span>
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

/** Empty: a successful fetch with zero results — distinct from error. */
export function EmptyState({ folder = "inbox" }: { folder?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted">
        <InboxIcon className="size-[17px] text-muted-foreground/70" />
      </span>
      <span className="text-[13.5px] font-semibold text-foreground">
        Nothing in {folder}
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        New mail shows up here the moment Gmail has it.
      </span>
    </div>
  );
}
