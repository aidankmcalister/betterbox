import { useCallback, useRef, useState, type ReactNode } from "react";
import { RefreshCwIcon } from "lucide-react";
import { GithubMark } from "@/components/integrations/github-mark";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

// Shared chrome for the GitHub board panels (Direction D — "status spine"):
// mono-forward, terminal-dense, colored left spine, inline stat segments,
// bracketed mono filter tabs. Used by both the PR and Issues panels.

/** Below this the row stacks (two-line card); above it collapses to one
 *  truncating line. Flex + truncation (not fixed columns) reads thin→full width. */
export const WIDE_AT = 560;

export function relTime(iso: string, now: number): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

/** Panel width (callback ref so it attaches after loading clears), driving the
 *  narrow/wide switch off pane size not viewport. */
export function usePanelWidth() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) {
      observerRef.current = null;
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  return [ref, width] as const;
}

/** Inline "N label" stat segments with vertical dividers. `you` segments
 *  (attention counts — awaiting review / assigned) render in the accent. */
export function StatStrip({
  segs,
}: {
  segs: { value: number; label: string; you?: boolean }[];
}) {
  return (
    <div className="no-scrollbar flex flex-none items-center overflow-x-auto border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
      {segs.map((s, i) => (
        <span
          key={s.label}
          className={cn(
            "inline-flex shrink-0 items-baseline gap-[5px] border-r border-border px-[11px] last:border-r-0",
            i === 0 && "pl-0",
            s.you && "text-primary",
          )}
        >
          <span
            className={cn(
              "text-[12.5px] font-semibold",
              s.you ? "text-primary" : "text-foreground",
            )}
          >
            {formatCount(s.value)}
          </span>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Filter as a compact shadcn Select (id equals label, so the trigger shows it
 *  directly), with the result count on the right. */
export function FilterSelect<T extends string>({
  items,
  value,
  onChange,
  shown,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  shown: number;
}) {
  return (
    <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2">
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger
          size="sm"
          className="h-7 w-auto gap-1.5 font-mono text-[11px] capitalize"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem
              key={it.id}
              value={it.id}
              className="font-mono text-[12px] capitalize"
            >
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-auto font-mono text-[10.5px] whitespace-nowrap text-muted-foreground/60">
        {shown} shown
      </span>
    </div>
  );
}

/** A row: 3px colored spine (state/attention) + body. `spine` is a bg utility
 *  class (bg-primary / bg-label-green / …). */
export function SpineRow({
  spine,
  href,
  onClick,
  children,
}: {
  spine: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  const navigable = !!href && href !== "#";
  return (
    <a
      href={navigable ? href : undefined}
      target={navigable ? "_blank" : undefined}
      rel="noopener noreferrer"
      onClick={onClick}
      className={cn(
        "flex border-b border-border/60",
        navigable || onClick ? "cursor-pointer hover:bg-muted/40" : "",
      )}
    >
      <span className={cn("w-[3px] shrink-0", spine)} />
      <div className="min-w-0 flex-1">{children}</div>
    </a>
  );
}

/** A dot + lowercase status label, tinted by `color` (a text-* class). */
export function StatusDot({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-[5px] font-mono text-[10.5px]",
        color,
      )}
    >
      <i className="size-[6px] shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Diff magnitude as segments — green for the additions share, red for the rest. */
export function Sparkbar({
  additions,
  deletions,
  segments = 9,
}: {
  additions: number;
  deletions: number;
  segments?: number;
}) {
  const total = additions + deletions;
  const green =
    total === 0
      ? 0
      : Math.min(
          segments,
          Math.max(
            additions > 0 ? 1 : 0,
            Math.round((additions / total) * segments),
          ),
        );
  return (
    <span className="inline-flex shrink-0 gap-[1.5px]">
      {Array.from({ length: segments }).map((_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length bar segments, never reordered.
          key={i}
          className={cn(
            "h-[9px] w-[3px] rounded-[1px]",
            i < green ? "bg-label-green" : "bg-label-red",
          )}
        />
      ))}
    </span>
  );
}

/** Outline label pills (issue labels), colored from the GitHub label hex. */
export function LabelPills({
  labels,
  max = 2,
}: {
  labels: { name: string; color: string }[];
  max?: number;
}) {
  if (labels.length === 0) return null;
  return (
    <span className="flex min-w-0 shrink items-center gap-1">
      {labels.slice(0, max).map((l) => (
        <span
          key={l.name}
          className="inline-flex max-w-[110px] items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px] whitespace-nowrap"
          style={{ borderColor: `${l.color}66`, color: l.color }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: l.color }}
          />
          <span className="truncate">{l.name}</span>
        </span>
      ))}
      {labels.length > max && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
          +{labels.length - max}
        </span>
      )}
    </span>
  );
}

/** Mono "live from the GitHub API" footer. */
export function GithubFooter() {
  return (
    <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/60">
      <GithubMark className="size-3" />
      live from the GitHub API
    </div>
  );
}

export function PanelEmptyState({ label }: { label: string }) {
  return (
    <div className="px-4 py-12 text-center font-mono text-[12px] text-muted-foreground/70">
      {label}
    </div>
  );
}

export function PanelRefresh({
  fetching,
  onRefresh,
}: {
  fetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
    >
      <RefreshCwIcon className={cn("size-3.5", fetching && "animate-spin")} />
    </button>
  );
}

export function ConnectState({
  blurb,
  onConnect,
}: {
  blurb: string;
  onConnect: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-muted">
          <GithubMark className="size-6 text-foreground" />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.3px]">
          Connect GitHub
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {blurb}
        </p>
        <Button onClick={onConnect} className="mt-1">
          <GithubMark className="size-4" />
          Connect GitHub
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          read-only
        </span>
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="font-mono text-[11.5px] wrap-break-word text-muted-foreground/80">
          {message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-none items-center gap-3 border-b border-border px-3 py-2.5">
        {[14, 20].map((w) => (
          <span
            key={w}
            className="h-3 animate-pulse rounded bg-muted/60"
            style={{ width: w * 4 }}
          />
        ))}
      </div>
      <div className="flex-1 space-y-px p-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders.
            key={i}
            className="flex items-center gap-2 px-3 py-2.5"
          >
            <span className="size-2 animate-pulse rounded-full bg-muted" />
            <span className="h-3 w-24 animate-pulse rounded bg-muted" />
            <span className="h-3 flex-1 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
