import { BadgeCheckIcon } from "lucide-react";

import { AccountDot, useAccountColor } from "@/components/account-dot";
import { SenderAvatar } from "@/components/sender-avatar";
import { useSettings } from "@/hooks/use-settings";
import { isVerifiedSender } from "@/lib/verified-senders";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuGroup,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

export type ThreadRowEmail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet?: string;
  unread?: boolean;
  /** Gmail label ids on the message (tags are the user-created ones). */
  labelIds?: string[];
};

export type Density = "comfortable" | "compact";

function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*)"?\s*</);
  const name = match?.[1]?.trim();
  return name || from.replace(/[<>]/g, "").trim();
}

function senderAddress(from: string): string {
  return from.match(/<([^>]+)>/)?.[1]?.trim() || from.trim();
}

function shortTime(raw: string, hour12: boolean): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: hour12 ? "numeric" : "2-digit",
      minute: "2-digit",
      hour12,
    });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { month: "short", year: "2-digit" });
}

import { actOnEmail, markEmailsRead } from "@/lib/mail-queries";

export function ThreadRow({
  email,
  density = "comfortable",
  selected = false,
  dotIndex,
  accountId,
  onClick,
  portalContainer,
}: {
  email: ThreadRowEmail;
  density?: Density;
  selected?: boolean;
  dotIndex: number;
  accountId?: string;
  onClick?: () => void;
  /** Portal target for the right-click menu — set in the landing demo so it
   *  stays inside (and scaled with) the demo box instead of escaping to body. */
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const runMarkRead = async () => {
    if (!accountId) return;
    await markEmailsRead(accountId, [email.id]);
  };

  const runTrash = async () => {
    if (!accountId) return;
    await actOnEmail(accountId, email.id, "trash");
  };

  // Open the reader, then signal it. The ReaderPane mounts on the next render
  // and attaches its start-reply/start-forward listener in a passive effect
  // (after paint), so a synchronous dispatch would miss it — wait two frames.
  const openThen = (eventName: "start-reply" | "start-forward") => {
    if (onClick) onClick();
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: { accountId, emailId: email.id },
          }),
        ),
      ),
    );
  };

  const runReply = () => openThen("start-reply");
  const runForward = () => openThen("start-forward");

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(email.id);
    } catch {}
  };

  const { snippetFont, showSnippets, clock, inboxAvatars } = useSettings();
  const accountColor = useAccountColor(dotIndex, accountId);
  const unread = email.unread ?? false;
  const subject = email.subject || "(no subject)";

  const avatar = (size: string) =>
    inboxAvatars ? (
      <SenderAvatar
        name={senderName(email.from)}
        address={senderAddress(email.from)}
        color={accountColor}
        className={cn("shrink-0", size)}
      />
    ) : null;
  // The selected accent is an inset box-shadow, not a left border — a real
  // border-left miters against border-b and leaves a diagonal notch at the
  // bottom-left corner of every row.
  const rowClass = cn(
    "w-full min-w-0 cursor-pointer overflow-hidden border-b border-border text-left hover:bg-muted",
    selected && "bg-accent shadow-[inset_2px_0_0_var(--color-primary)]",
  );
  const verified = isVerifiedSender(senderAddress(email.from));
  const sender = (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className={cn(
          "truncate",
          unread
            ? "font-semibold text-foreground"
            : "font-normal text-foreground/70",
        )}
      >
        {senderName(email.from)}
      </span>
      {verified && (
        <BadgeCheckIcon
          aria-label="Verified sender"
          className="size-3 shrink-0 text-label-blue"
        />
      )}
    </span>
  );
  const time = (
    <span
      className={cn(
        "shrink-0 font-mono text-[10.5px] whitespace-nowrap",
        unread ? "text-muted-foreground" : "text-muted-foreground/70",
      )}
    >
      {shortTime(email.date, clock === "12h")}
    </span>
  );
  const subjectSnippet = (
    <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground/70">
      <span
        className={cn(
          unread ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {subject}
      </span>
      {showSnippets && email.snippet && (
        <span
          className={cn(
            "text-muted-foreground/70",
            snippetFont === "mono" && "font-mono text-[11px]",
          )}
        >
          {"  —  " + email.snippet}
        </span>
      )}
    </span>
  );

  if (density === "compact") {
    return (
      <div className="relative">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              onClick={onClick}
              className={cn(
                rowClass,
                "flex h-[34px] items-center gap-[9px] px-3.5",
              )}
            >
              <AccountDot
                colorIndex={dotIndex}
                accountId={accountId}
                unread={unread}
              />
              {avatar("size-[18px]")}
              <span className="flex w-28 shrink-0 text-[12.5px]">{sender}</span>
              {subjectSnippet}
              <span className="min-w-[54px] shrink-0 text-right">{time}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent container={portalContainer}>
            <ContextMenuGroup>
              <ContextMenuItem onClick={runMarkRead}>Mark read</ContextMenuItem>
              <ContextMenuItem onClick={runReply}>Reply</ContextMenuItem>
              <ContextMenuItem onClick={runForward}>Forward</ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem onClick={runTrash} variant="destructive">
                Trash
              </ContextMenuItem>
              <ContextMenuItem onClick={copyId}>Copy id</ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  return (
    <div className="relative">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(rowClass, "flex gap-2.5 px-3.5")}
          >
            {inboxAvatars ? (
              <span className="flex items-center gap-2 pt-[3px]">
                <AccountDot
                  colorIndex={dotIndex}
                  accountId={accountId}
                  unread={unread}
                />
                {avatar("size-7")}
              </span>
            ) : (
              <span className="pt-[5px]">
                <AccountDot
                  colorIndex={dotIndex}
                  accountId={accountId}
                  unread={unread}
                />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[13px]">
                <span className="flex min-w-0 flex-1 text-left">{sender}</span>
                {time}
              </span>
              {subjectSnippet}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent container={portalContainer}>
          <ContextMenuGroup>
            <ContextMenuItem onClick={runMarkRead}>Mark read</ContextMenuItem>
            <ContextMenuItem onClick={runReply}>Reply</ContextMenuItem>
            <ContextMenuItem onClick={runForward}>Forward</ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem onClick={runTrash} variant="destructive">
              Trash
            </ContextMenuItem>
            <ContextMenuItem onClick={copyId}>Copy id</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
