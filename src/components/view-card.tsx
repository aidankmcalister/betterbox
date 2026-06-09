import { CheckIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { accountDotColor } from "@/components/account-dot";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ScopeAccount = { accountId: string; email: string; unread: number };

/** "alex@gmail.com" → "alex" — short labels for the composed-view header. */
function shortName(email: string): string {
  return email.split("@")[0] || email;
}

/**
 * The view builder: a single card. Header shows the composed view (stacked
 * dots + label + unread total); rows beneath are the accounts, checked in or
 * out of the view. Clicking the header resets to all accounts.
 */
export function ViewCard({
  accounts,
  scopeIds,
  allOn,
  onToggle,
  onAddAccount,
}: {
  accounts: ScopeAccount[];
  scopeIds: string[];
  allOn: boolean;
  onToggle: (id: string | "all") => void;
  onAddAccount?: () => void;
}) {
  const inView = accounts.filter((a) => scopeIds.includes(a.accountId));
  const label = allOn
    ? "All accounts"
    : inView.map((a) => shortName(a.email)).join(" + ");
  const totalUnread = inView.reduce((sum, a) => sum + a.unread, 0);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => onToggle("all")}
        title={allOn ? "Viewing all accounts" : "Reset to all accounts"}
        className={cn(
          "group/head flex w-full items-center gap-[9px] border-b px-2.5 py-2 text-left",
          allOn ? "cursor-default" : "hover:bg-muted",
        )}
      >
        <span className="inline-flex shrink-0">
          {inView.map((account, i) => (
            <span
              key={account.accountId}
              className="size-[11px] rounded-full border-2 border-card"
              style={{
                background: accountDotColor(
                  accounts.findIndex((a) => a.accountId === account.accountId),
                ),
                marginLeft: i ? -4 : 0,
                position: "relative",
                zIndex: inView.length - i,
              }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {label}
        </span>
        {!allOn && (
          <RotateCcwIcon className="hidden size-3 shrink-0 text-muted-foreground group-hover/head:inline-flex" />
        )}
        {totalUnread > 0 && (
          <span
            className={cn(
              "shrink-0 font-mono text-[10.5px] text-muted-foreground",
              !allOn && "group-hover/head:hidden",
            )}
          >
            {formatCount(totalUnread)} new
          </span>
        )}
      </button>

      <div className="flex flex-col p-1">
        {accounts.map((account, index) => {
          const on = scopeIds.includes(account.accountId);
          const locked = on && scopeIds.length === 1;
          const color = accountDotColor(index);
          return (
            <button
              key={account.accountId}
              type="button"
              onClick={() => onToggle(account.accountId)}
              title={
                on
                  ? locked
                    ? "At least one account stays in view"
                    : `Remove ${shortName(account.email)} from view`
                  : `Add ${shortName(account.email)} to view`
              }
              className={cn(
                "group/row flex w-full items-center gap-2 rounded-[5px] px-[7px] py-[5px] text-left",
                locked ? "cursor-default" : "hover:bg-muted",
              )}
            >
              <span
                className="size-[7px] shrink-0 rounded-full transition-opacity"
                style={
                  on
                    ? { background: color }
                    : {
                        background: "transparent",
                        boxShadow: `inset 0 0 0 1.5px ${color}`,
                        opacity: 0.45,
                      }
                }
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  on
                    ? "font-medium text-foreground"
                    : "text-muted-foreground/70",
                )}
                title={account.email}
              >
                {shortName(account.email)}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[10px]",
                  on ? "text-muted-foreground" : "text-muted-foreground/70",
                )}
              >
                {formatCount(account.unread)}
              </span>
              <span className="inline-flex w-[13px] shrink-0 justify-center">
                {on ? (
                  <>
                    <CheckIcon
                      className={cn(
                        "size-3 text-muted-foreground",
                        !locked && "group-hover/row:hidden",
                      )}
                    />
                    {!locked && (
                      <XIcon className="hidden size-3 text-muted-foreground group-hover/row:inline-flex" />
                    )}
                  </>
                ) : (
                  <PlusIcon className="hidden size-3 text-foreground group-hover/row:inline-flex" />
                )}
              </span>
            </button>
          );
        })}
        {onAddAccount && (
          <button
            type="button"
            onClick={onAddAccount}
            className="group/add flex w-full items-center gap-2 rounded-[5px] px-[7px] py-[5px] text-left hover:bg-muted"
          >
            <span className="inline-flex w-[7px] shrink-0 items-center justify-center">
              <PlusIcon className="size-3 shrink-0 text-muted-foreground/70 group-hover/add:text-foreground" />
            </span>
            <span className="text-xs text-muted-foreground/70 group-hover/add:text-foreground">
              Add account
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
