import { useState, type RefObject } from "react";
import { ChevronRightIcon } from "lucide-react";

import {
  flattenEmails,
  useLabelEmailsQuery,
  useLabelsQuery,
  type Label,
} from "@/lib/mail-queries";
import { useSettings } from "@/hooks/use-settings";
import { LabelDot } from "@/components/tag-picker";
import { ThreadRow } from "@/components/thread-row";
import { SkeletonRows } from "@/components/thread-list-states";
import { cn } from "@/lib/utils";

type RowHandlers = {
  openEmail: (accountId: string, emailId: string) => void;
  getOpenEmail: (accountId: string) => string | null;
  /** Portal target for row context menus (landing demo). */
  portalContainer?: RefObject<HTMLElement | null>;
};

/** The Labeled folder: one collapsible accordion per tag, lazily loading the
 *  tag's messages the first time it's expanded. */
export function LabeledView({
  accountId,
  dotIndex,
  openEmail,
  getOpenEmail,
  portalContainer,
}: { accountId: string; dotIndex: number } & RowHandlers) {
  const labels = useLabelsQuery(accountId).data ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (labels.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
        <p className="text-[13px] text-muted-foreground">No tags yet</p>
        <p className="font-mono text-[10.5px] text-muted-foreground/70">
          tag a message and it’ll be grouped here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {labels.map((label) => (
        <LabelAccordion
          key={label.id}
          accountId={accountId}
          dotIndex={dotIndex}
          label={label}
          open={expanded.has(label.id)}
          onToggle={() => toggle(label.id)}
          openEmail={openEmail}
          getOpenEmail={getOpenEmail}
          portalContainer={portalContainer}
        />
      ))}
    </div>
  );
}

function LabelAccordion({
  accountId,
  dotIndex,
  label,
  open,
  onToggle,
  openEmail,
  getOpenEmail,
  portalContainer,
}: {
  accountId: string;
  dotIndex: number;
  label: Label;
  open: boolean;
  onToggle: () => void;
} & RowHandlers) {
  const { density } = useSettings();
  const query = useLabelEmailsQuery(accountId, label, open);
  const emails = flattenEmails(query.data);

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
            open && "rotate-90",
          )}
        />
        <LabelDot label={label} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {label.name}
        </span>
        {open && emails && (
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
            {emails.length}
          </span>
        )}
      </button>

      {open &&
        (!emails ? (
          <SkeletonRows density={density} count={1} />
        ) : emails.length === 0 ? (
          <p className="px-9 py-3 text-[12.5px] text-muted-foreground">
            No messages with this tag.
          </p>
        ) : (
          emails.map((email) => (
            <ThreadRow
              key={email.id}
              email={email}
              density={density}
              dotIndex={dotIndex}
              accountId={accountId}
              selected={getOpenEmail(accountId) === email.id}
              onClick={() => openEmail(accountId, email.id)}
              portalContainer={portalContainer}
            />
          ))
        ))}
    </div>
  );
}
