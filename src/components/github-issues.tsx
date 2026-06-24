import { useMemo, useState } from "react";
import { MessageSquareIcon } from "lucide-react";

import { linkGithub } from "@/lib/auth-client";
import { useGithubIssuesQuery, type GithubIssue } from "@/lib/github-queries";
import { cn } from "@/lib/utils";
import {
  ConnectState,
  EmptyState,
  ErrorState,
  FilterTabs,
  GithubFooter,
  LabelPills,
  PanelSkeleton,
  SpineRow,
  StatStrip,
  StatusDot,
  WIDE_AT,
  relTime,
  usePanelWidth,
} from "@/components/github-panel";

/** Spine: accent when assigned to you, else the issue's state color. */
function issueSpine(i: GithubIssue): string {
  if (i.assignedToYou) return "bg-primary";
  return i.state === "closed" ? "bg-label-purple" : "bg-label-green";
}

function issueStatus(i: GithubIssue): { color: string; label: string } {
  if (i.assignedToYou) return { color: "text-primary", label: "assigned" };
  if (i.state === "closed")
    return { color: "text-label-purple", label: "closed" };
  return { color: "text-muted-foreground/70", label: "opened" };
}

function Comments({ n }: { n: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-muted-foreground/60">
      <MessageSquareIcon className="size-3" />
      {n}
    </span>
  );
}

function IssueRow({
  issue,
  now,
  wide,
}: {
  issue: GithubIssue;
  now: number;
  wide: boolean;
}) {
  const status = issueStatus(issue);
  return (
    <SpineRow spine={issueSpine(issue)} href={issue.url}>
      {wide ? (
        <div className="flex h-8 items-center gap-[10px] px-[11px]">
          <span className="max-w-[150px] shrink-0 truncate font-mono text-[11px] text-muted-foreground">
            {issue.repo}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
            #{issue.num}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px] text-foreground",
              issue.assignedToYou && "font-semibold",
            )}
          >
            {issue.title}
          </span>
          <span className="hidden min-w-0 shrink @xl:flex">
            <LabelPills labels={issue.labels} max={2} />
          </span>
          <StatusDot color={status.color}>{status.label}</StatusDot>
          <Comments n={issue.comments} />
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/60">
            {relTime(issue.updated, now)}
          </span>
        </div>
      ) : (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="min-w-0 truncate text-muted-foreground">
              {issue.repo}
            </span>
            <span className="shrink-0 text-muted-foreground/60">
              #{issue.num}
            </span>
            <span className="flex-1" />
            <span className="shrink-0 text-muted-foreground/60">
              {relTime(issue.updated, now)}
            </span>
          </div>
          <p
            className={cn(
              "my-[5px] line-clamp-2 text-[12.5px] leading-[1.35] text-foreground",
              issue.assignedToYou && "font-semibold",
            )}
          >
            {issue.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusDot color={status.color}>{status.label}</StatusDot>
            <LabelPills labels={issue.labels} max={3} />
            <Comments n={issue.comments} />
          </div>
        </div>
      )}
    </SpineRow>
  );
}

type FilterId = "all" | "assigned" | "opened";

const matches = (i: GithubIssue, f: FilterId) =>
  f === "all" ? true : f === "assigned" ? i.assignedToYou : !i.assignedToYou;

export function GithubIssuesPage({ signedIn = false }: { signedIn?: boolean }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [ref, width] = usePanelWidth();
  const wide = width >= WIDE_AT;
  const query = useGithubIssuesQuery(signedIn);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh data lands.
  const now = useMemo(() => Date.now(), [query.dataUpdatedAt]);

  if (query.isLoading) return <PanelSkeleton />;
  if (query.data && !query.data.linked) {
    return (
      <ConnectState
        blurb="Link your GitHub account to BetterBox (no new account, just a sign-in) and the issues assigned to you, or that you opened, show up here."
        onConnect={linkGithub}
      />
    );
  }
  if (query.isError || query.data?.error) {
    return (
      <ErrorState
        title="Couldn’t load issues"
        message={query.data?.error ?? String(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  }

  const issues = query.data?.issues ?? [];
  const nAssigned = issues.filter((i) => i.assignedToYou).length;
  const nOpened = issues.length - nAssigned;
  const rows = issues.filter((i) => matches(i, filter));

  return (
    <div
      ref={ref}
      className="@container flex h-full min-w-0 flex-col bg-background"
    >
      <StatStrip
        segs={[
          { value: nAssigned, label: "assigned to you", you: true },
          { value: nOpened, label: "opened by you" },
        ]}
      />
      <FilterTabs
        value={filter}
        onChange={setFilter}
        shown={rows.length}
        items={[
          { id: "all", label: "all" },
          { id: "assigned", label: "assigned" },
          { id: "opened", label: "opened" },
        ]}
      />
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState label="No issues match this filter." />
        ) : (
          <>
            {rows.map((issue) => (
              <IssueRow key={issue.id} issue={issue} now={now} wide={wide} />
            ))}
            <GithubFooter />
          </>
        )}
      </div>
    </div>
  );
}
