import {
  BadgeCheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
} from "lucide-react";

import type { FullEmail } from "@/lib/mail-queries";
import { cn } from "@/lib/utils";
import { HtmlBody } from "@/components/mail/html-body";
import { SenderAvatar } from "@/components/mail/sender-avatar";
import { isVerifiedSender } from "@/lib/email/verified-senders";
import { Hint } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/ui/copy-button";
import {
  formatBytes,
  htmlToPlainText,
  isBareHtml,
  isoDate,
  parseAddress,
  relativeTime,
  timeOnly,
} from "../email-html";

export function ThreadMessage({
  message,
  accountId,
  expanded,
  onToggle,
  accountColor,
  hour12,
  narrow,
}: {
  message: FullEmail;
  accountId: string;
  expanded: boolean;
  onToggle: () => void;
  accountColor: string;
  hour12: boolean;
  narrow: boolean;
}) {
  const sender = parseAddress(message.from);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-1 py-2 text-left hover:bg-muted/40"
      >
        <SenderAvatar
          name={sender.name}
          address={sender.address}
          color={accountColor}
          className="size-7"
        />
        <span className="shrink-0 text-[13px] font-medium">{sender.name}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          {message.snippet}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
          {relativeTime(message.date)}
        </span>
      </button>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div
          className={cn(
            "flex items-center gap-3",
            narrow ? "px-3.5 py-3.5" : "px-[18px] py-4",
          )}
        >
          <SenderAvatar
            name={sender.name}
            address={sender.address}
            color={accountColor}
            className="size-11"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggle}
                className="cursor-pointer truncate text-[16px] font-semibold tracking-[-0.2px] hover:underline"
              >
                {sender.name}
              </button>
              {isVerifiedSender(sender.address) && (
                <Hint label="Verified sender">
                  <BadgeCheckIcon className="size-4 shrink-0 text-label-blue" />
                </Hint>
              )}
            </div>
            <div className="mt-[3px] truncate font-mono text-[11.5px] text-muted-foreground">
              &lt;{sender.address}&gt;
            </div>
          </div>
          <Hint label={isoDate(message.date)}>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[12px] text-muted-foreground">
                {timeOnly(message.date, hour12)}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                {relativeTime(message.date)}
              </div>
            </div>
          </Hint>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 border-t bg-secondary py-2.5",
            narrow ? "px-3.5" : "px-[18px]",
          )}
        >
          <span className="shrink-0 text-[11.5px] text-muted-foreground/70">
            to
          </span>
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: accountColor }}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
            {message.to || "—"}
          </span>
          {message.messageId && (
            <CopyButton
              value={message.messageId}
              label="Copy message ID"
              iconOnly={narrow}
            />
          )}
        </div>
      </div>

      <div className="mt-3.5 overflow-hidden rounded-xl border bg-card shadow-lg shadow-black/30">
        {message.bodyHtml && !isBareHtml(message.bodyHtml) ? (
          <HtmlBody
            html={message.bodyHtml}
            accountId={accountId}
            messageId={message.id}
            inlineAttachments={message.inlineAttachments}
          />
        ) : (
          <div className="px-5 py-4">
            {(
              message.body?.trim() ||
              (message.bodyHtml ? htmlToPlainText(message.bodyHtml) : "") ||
              message.snippet ||
              "(empty message)"
            )
              .split("\n")
              .map((line, i) =>
                line.trim() === "" ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: plain-text body split into static, non-reorderable lines.
                  <div key={i} className="h-3" />
                ) : (
                  <p
                    // biome-ignore lint/suspicious/noArrayIndexKey: plain-text body split into static, non-reorderable lines.
                    key={i}
                    className="m-0 text-sm leading-[1.65] text-pretty text-foreground/85"
                  >
                    {line}
                  </p>
                ),
              )}
          </div>
        )}
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.attachments.map((att) => {
            const base = `/api/message?accountId=${encodeURIComponent(accountId)}&id=${encodeURIComponent(message.id)}&attachment=${encodeURIComponent(att.attachmentId)}&mime=${encodeURIComponent(att.mimeType)}`;
            const viewUrl = `${base}&view=1`;
            const downloadUrl = `${base}&download=1&filename=${encodeURIComponent(att.filename)}`;
            const isImage = /^image\/(png|jpe?g|gif|webp|avif)$/i.test(
              att.mimeType,
            );
            // Matches the endpoint's view allowlist — only these open inline.
            const canView =
              isImage || /^(application\/pdf|text\/plain)$/i.test(att.mimeType);
            const iconBtn =
              "inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
            return (
              <div
                key={att.attachmentId}
                className="flex items-center gap-2.5 rounded-lg border bg-card p-2 pr-1.5"
              >
                {isImage ? (
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-none"
                  >
                    <img
                      src={viewUrl}
                      alt=""
                      className="size-10 rounded object-cover"
                    />
                  </a>
                ) : (
                  <span className="flex size-10 flex-none items-center justify-center rounded bg-muted">
                    <FileTextIcon className="size-5 text-muted-foreground" />
                  </span>
                )}
                <div className="max-w-[150px] min-w-0">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {att.filename}
                  </div>
                  {att.size > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      {formatBytes(att.size)}
                    </div>
                  )}
                </div>
                <div className="flex flex-none items-center gap-0.5">
                  {canView && (
                    <Hint label="Open in new tab">
                      <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open in new tab"
                        className={iconBtn}
                      >
                        <ExternalLinkIcon className="size-4" />
                      </a>
                    </Hint>
                  )}
                  <Hint label="Download">
                    <a
                      href={downloadUrl}
                      download={att.filename}
                      aria-label="Download"
                      className={iconBtn}
                    >
                      <DownloadIcon className="size-4" />
                    </a>
                  </Hint>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
