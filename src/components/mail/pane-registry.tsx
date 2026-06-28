import {
  CircleDotIcon,
  GitPullRequestIcon,
  MailOpenIcon,
  PencilIcon,
} from "lucide-react";

import { READER_PANE_ID } from "@/lib/layout-tree";
import { AccountDot } from "@/components/shell/account-dot";
import { panelKeyOf, type PaneRenderCtx, type PaneType } from "./tiles-context";
import { AccountPane } from "./panes/account-pane";
import { ReaderPane } from "./panes/reader-pane";
import { ComposePaneTile } from "./panes/compose-pane";
import { PullRequestsPane } from "./panes/pull-requests-pane";
import { GithubIssuesPane } from "./panes/github-issues-pane";

type PanelEntry = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  render: (paneId: string, ctx: PaneRenderCtx) => React.ReactNode;
};

const PANEL_REGISTRY: Record<string, PanelEntry> = {
  "pull-requests": {
    title: "Pull requests",
    icon: GitPullRequestIcon,
    render: (paneId, ctx) => (
      <PullRequestsPane
        paneId={paneId}
        onClose={() => ctx.onClosePanel(paneId)}
      />
    ),
  },
  "github-issues": {
    title: "Issues",
    icon: CircleDotIcon,
    render: (paneId, ctx) => (
      <GithubIssuesPane
        paneId={paneId}
        onClose={() => ctx.onClosePanel(paneId)}
      />
    ),
  },
};

type PaneTypeEntry = {
  render: (paneId: string, ctx: PaneRenderCtx) => React.ReactNode;
  dragLabel: (paneId: string, ctx: PaneRenderCtx) => React.ReactNode;
};

export const PANE_TYPES: Record<PaneType, PaneTypeEntry> = {
  email: {
    render: (paneId) => <AccountPane accountId={paneId} />,
    dragLabel: (paneId, ctx) => {
      const account = ctx.accounts.find((a) => a.accountId === paneId);
      if (!account) return null;
      return (
        <>
          <AccountDot
            colorIndex={ctx.accounts.indexOf(account)}
            accountId={account.accountId}
          />
          <span className="font-mono text-xs">{account.email}</span>
        </>
      );
    },
  },
  reader: {
    render: (paneId, ctx) => {
      // Shared reader (one at a time) only survives while a message is open.
      if (paneId === READER_PANE_ID) {
        if (!ctx.reading) return null;
        const acc = ctx.reading.accountId;
        return (
          <ReaderPane
            paneId={paneId}
            accountId={acc}
            emailId={ctx.reading.emailId}
            onClose={() => ctx.closeReaderFor(acc)}
          />
        );
      }
      // Per-account split reader: id is `${READER_PANE_ID}:${accountId}`.
      const acc = paneId.slice(READER_PANE_ID.length + 1);
      return (
        <ReaderPane
          paneId={paneId}
          accountId={acc}
          emailId={ctx.openEmails[acc] ?? null}
          onClose={() => ctx.closeReaderFor(acc)}
        />
      );
    },
    dragLabel: () => (
      <>
        <MailOpenIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs">Reading pane</span>
      </>
    ),
  },
  composer: {
    render: (_paneId, ctx) =>
      ctx.compose ? (
        <ComposePaneTile compose={ctx.compose} accounts={ctx.accounts} />
      ) : null,
    dragLabel: () => (
      <>
        <PencilIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs">New message</span>
      </>
    ),
  },
  panel: {
    render: (paneId, ctx) =>
      PANEL_REGISTRY[panelKeyOf(paneId)]?.render(paneId, ctx) ?? null,
    dragLabel: (paneId) => {
      const entry = PANEL_REGISTRY[panelKeyOf(paneId)];
      if (!entry) return null;
      const Icon = entry.icon;
      return (
        <>
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-xs">{entry.title}</span>
        </>
      );
    },
  },
};
