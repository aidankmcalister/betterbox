import { useMemo, useState } from "react";
import {
  CheckIcon,
  ClockIcon,
  EyeIcon,
  MessageSquareIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { linkGithub } from "@/lib/auth-client";
import { usePullRequestsQuery, type PullRequest } from "@/lib/github-queries";
import demoPullRequests from "@/data/demo-pull-requests.json";
import { GithubMark } from "@/components/github-mark";
import { cn } from "@/lib/utils";
import {
  ConnectState,
  EmptyState,
  ErrorState,
  FilterSelect,
  GithubFooter,
  PanelSkeleton,
  Sparkbar,
  SpineRow,
  StatStrip,
  StatusDot,
  WIDE_AT,
  relTime,
  usePanelWidth,
} from "@/components/github-panel";

type CiState = PullRequest["ci"];

/** Left-spine color: accent when it needs you, else the PR's state color. */
function prSpine(pr: PullRequest): string {
  if (pr.awaitsYou) return "bg-primary";
  if (pr.state === "merged") return "bg-label-purple";
  if (pr.state === "closed") return "bg-label-red";
  if (pr.state === "draft") return "bg-muted-foreground/40";
  if (pr.review === "changes") return "bg-label-red";
  return "bg-label-green";
}

/** The dot+label review status shown on the row. */
function prStatus(pr: PullRequest): { color: string; label: string } {
  if (pr.state === "merged")
    return { color: "text-label-purple", label: "merged" };
  if (pr.state === "closed")
    return { color: "text-label-red", label: "closed" };
  if (pr.state === "draft")
    return { color: "text-muted-foreground/70", label: "draft" };
  if (pr.review === "approved")
    return { color: "text-label-green", label: "approved" };
  if (pr.review === "changes")
    return { color: "text-label-red", label: "changes" };
  if (pr.review === "commented")
    return { color: "text-label-blue", label: "commented" };
  return { color: "text-muted-foreground/70", label: "review" };
}

function Ci({ ci }: { ci: CiState }) {
  if (ci === "none")
    return (
      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/50">
        —
      </span>
    );
  const look = {
    passing: { Icon: CheckIcon, cls: "text-label-green bg-label-green/15" },
    failing: { Icon: XIcon, cls: "text-label-red bg-label-red/15" },
    pending: { Icon: ClockIcon, cls: "text-label-yellow bg-label-yellow/15" },
  }[ci];
  return (
    <span
      className={cn(
        "inline-flex size-[15px] shrink-0 items-center justify-center rounded-full",
        look.cls,
      )}
    >
      <look.Icon className="size-[10px]" strokeWidth={2.5} />
    </span>
  );
}

function Diff({ pr }: { pr: PullRequest }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[7px] font-mono text-[10.5px]">
      <span className="text-label-green">+{pr.additions.toLocaleString()}</span>
      <span className="text-label-red">−{pr.deletions.toLocaleString()}</span>
      <Sparkbar additions={pr.additions} deletions={pr.deletions} />
    </span>
  );
}

function Comments({ n }: { n: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-muted-foreground/60">
      <MessageSquareIcon className="size-3" />
      {n}
    </span>
  );
}

function PRRow({
  pr,
  now,
  wide,
  demo,
}: {
  pr: PullRequest;
  now: number;
  wide: boolean;
  demo: boolean;
}) {
  const status = prStatus(pr);
  const onClick = demo
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        toast("Opens on GitHub", {
          icon: <GithubMark className="size-4" />,
          description: `In the live app, ${pr.repo} #${pr.num} opens on github.com — sealed in this demo.`,
        });
      }
    : undefined;

  return (
    <SpineRow spine={prSpine(pr)} href={pr.url} onClick={onClick}>
      {wide ? (
        <div className="flex h-8 items-center gap-[10px] px-[11px]">
          <span className="max-w-[130px] shrink-0 truncate font-mono text-[11px] text-muted-foreground">
            {pr.repo}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
            #{pr.num}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px] text-foreground",
              pr.awaitsYou && "font-semibold",
            )}
          >
            {pr.title}
          </span>
          <span className="hidden max-w-[150px] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground/60 @2xl:inline">
            {pr.branch} → {pr.base}
          </span>
          <StatusDot color={status.color}>{status.label}</StatusDot>
          <Diff pr={pr} />
          <Ci ci={pr.ci} />
          <Comments n={pr.comments} />
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/60">
            {relTime(pr.updated, now)}
          </span>
        </div>
      ) : (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="min-w-0 truncate text-muted-foreground">
              {pr.repo}
            </span>
            <span className="shrink-0 text-muted-foreground/60">#{pr.num}</span>
            <span className="flex-1" />
            {pr.awaitsYou && (
              <EyeIcon className="size-[11px] shrink-0 text-primary" />
            )}
            <span className="shrink-0 text-muted-foreground/60">
              {relTime(pr.updated, now)}
            </span>
          </div>
          <p
            className={cn(
              "my-[5px] line-clamp-2 text-[12.5px] leading-[1.35] text-foreground",
              pr.awaitsYou && "font-semibold",
            )}
          >
            {pr.title}
          </p>
          <div className="flex items-center gap-x-3">
            <StatusDot color={status.color}>{status.label}</StatusDot>
            <Diff pr={pr} />
            <span className="ml-auto flex shrink-0 items-center gap-3">
              <Ci ci={pr.ci} />
              <Comments n={pr.comments} />
            </span>
          </div>
        </div>
      )}
    </SpineRow>
  );
}

type FilterId = "all" | "open" | "review" | "approved" | "merged";

const matches = (p: PullRequest, f: FilterId) => {
  if (f === "all") return true;
  if (f === "open") return p.state === "open" || p.state === "draft";
  if (f === "review") return p.awaitsYou;
  if (f === "approved") return p.state === "open" && p.review === "approved";
  if (f === "merged") return p.state === "merged";
  return true;
};

type DemoPr = Omit<PullRequest, "url" | "author" | "labels" | "updated"> & {
  minutesAgo: number;
};

function makeDemoPullRequests(): PullRequest[] {
  const now = Date.now();
  return (demoPullRequests as unknown as DemoPr[]).map(
    ({ minutesAgo, ...rec }) => ({
      ...rec,
      labels: [],
      author: "you",
      url: "#",
      updated: new Date(now - minutesAgo * 60_000).toISOString(),
    }),
  );
}

export function PullRequestsPage({
  signedIn = false,
  demo = false,
}: {
  signedIn?: boolean;
  /** Landing-page sandbox: render seeded PRs, no API / connect / loading. */
  demo?: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>("open");
  const [ref, width] = usePanelWidth();
  const wide = width >= WIDE_AT;
  const query = usePullRequestsQuery(signedIn && !demo);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh data lands.
  const now = useMemo(() => Date.now(), [query.dataUpdatedAt]);
  const demoPrs = useMemo(() => (demo ? makeDemoPullRequests() : []), [demo]);

  if (!demo) {
    if (query.isLoading) return <PanelSkeleton />;
    if (query.data && !query.data.linked) {
      return (
        <ConnectState
          blurb="Link your GitHub account to BetterBox (no new account, just a sign-in) and your open pull requests show up here — authored and review-requested, with status, CI, and diff size."
          onConnect={linkGithub}
        />
      );
    }
    if (query.isError || query.data?.error) {
      return (
        <ErrorState
          title="Couldn’t load pull requests"
          message={query.data?.error ?? String(query.error)}
          onRetry={() => query.refetch()}
        />
      );
    }
  }

  const prs = demo ? demoPrs : (query.data?.prs ?? []);
  const nOpen = prs.filter(
    (p) => p.state === "open" || p.state === "draft",
  ).length;
  const nReview = prs.filter((p) => p.awaitsYou).length;
  const nChanges = prs.filter(
    (p) => p.state === "open" && p.review === "changes",
  ).length;
  const nMerged = prs.filter((p) => p.state === "merged").length;
  const rows = prs.filter((p) => matches(p, filter));

  return (
    <div
      ref={ref}
      className="@container flex h-full min-w-0 flex-col bg-background"
    >
      <StatStrip
        segs={[
          { value: nOpen, label: "open" },
          { value: nReview, label: "awaiting you", you: true },
          { value: nChanges, label: "changes" },
          { value: nMerged, label: "merged" },
        ]}
      />
      <FilterSelect
        value={filter}
        onChange={setFilter}
        shown={rows.length}
        items={[
          { id: "open", label: "open" },
          { id: "review", label: "review" },
          { id: "approved", label: "approved" },
          { id: "merged", label: "merged" },
          { id: "all", label: "all" },
        ]}
      />
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState label="No pull requests match this filter." />
        ) : (
          <>
            {rows.map((pr) => (
              <PRRow key={pr.id} pr={pr} now={now} wide={wide} demo={demo} />
            ))}
            <GithubFooter />
          </>
        )}
      </div>
    </div>
  );
}
