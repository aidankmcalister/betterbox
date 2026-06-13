import { CheckIcon, FlaskConicalIcon, PlusIcon } from "lucide-react";
import { resolveAccountColor } from "@/components/account-dot";
import { useSettings } from "@/hooks/use-settings";
import type { Account } from "@/lib/account";
import { formatCount } from "@/lib/format";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Placeholder shown in the sidebar while accounts (and the session) load, so
 *  the View card area doesn't pop in late. Mirrors the card's shape. */
export function ViewCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-7 items-center border-b px-2">
        <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-1 p-1">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-[9px] px-1 py-[5px]">
            <div className="size-3.5 shrink-0 animate-pulse rounded-[4px] bg-muted" />
            <div
              className="h-3 animate-pulse rounded bg-muted/70"
              style={{ width: i === 0 ? "68%" : "52%" }}
            />
            <div className="ml-auto h-2.5 w-5 shrink-0 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
        {/* "Add account" row — keeps the skeleton's height ~= the real card. */}
        <div className="flex items-center gap-[9px] px-1 py-[5px]">
          <div className="size-3.5 shrink-0 animate-pulse rounded bg-muted/50" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

/**
 * The sidebar View section (design: status header + mono caps summary bar +
 * real checkboxes). The bar reports the composed view; each row's checkbox —
 * filled with the account's color — toggles it in or out of the scope.
 */
export function ViewCard({
  accounts,
  scopeIds,
  allOn,
  onToggle,
  onAddAccount,
  onAddTestAccount,
}: {
  accounts: Account[];
  scopeIds: string[];
  allOn: boolean;
  onToggle: (id: string | "all") => void;
  onAddAccount?: () => void;
  onAddTestAccount?: () => void;
}) {
  const { accountColors } = useSettings();
  const inView = accounts.filter((a) => scopeIds.includes(a.accountId));
  const totalUnread = inView.reduce((sum, a) => sum + a.unread, 0);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-7 items-center gap-[7px] border-b px-2">
        <span className="font-mono text-[10px] tracking-[0.5px] text-muted-foreground uppercase">
          {allOn
            ? "Viewing all"
            : `Viewing ${inView.length} of ${accounts.length}`}
        </span>
        {totalUnread > 0 && (
          <span className="ml-auto font-mono text-[10px] font-medium text-primary">
            {formatCount(totalUnread)} new
          </span>
        )}
      </div>

      <div className="flex flex-col p-1">
        {accounts.map((account, index) => {
          const on = scopeIds.includes(account.accountId);
          const locked = on && scopeIds.length === 1;
          const color = resolveAccountColor(
            index,
            account.accountId,
            accountColors,
          );
          return (
            <Hint
              key={account.accountId}
              label={
                on
                  ? locked
                    ? "At least one account stays in view"
                    : `Remove ${account.email} from view`
                  : `Add ${account.email} to view`
              }
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(account.accountId)}
                className={cn(
                  "flex w-full items-center gap-[9px] rounded-[5px] px-1 py-[5px] text-left",
                  locked ? "cursor-default" : "hover:bg-muted",
                )}
              >
                <span
                  className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px]"
                  style={
                    on
                      ? { background: color }
                      : {
                          boxShadow: `inset 0 0 0 1.5px ${color}`,
                          opacity: 0.45,
                        }
                  }
                >
                  {on && (
                    <CheckIcon className="size-2.5 text-term" strokeWidth={3} />
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12.5px]",
                    on
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {account.email}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10.5px]",
                    on ? "text-muted-foreground" : "text-muted-foreground/70",
                  )}
                >
                  {formatCount(account.unread)}
                </span>
              </button>
            </Hint>
          );
        })}

        {onAddAccount && (
          <button
            type="button"
            onClick={onAddAccount}
            className="group/add flex w-full items-center gap-[9px] rounded-[5px] px-1 py-[5px] text-left hover:bg-muted"
          >
            <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
              <PlusIcon className="size-3 shrink-0 text-muted-foreground/70 group-hover/add:text-foreground" />
            </span>
            <span className="text-[12.5px] text-muted-foreground/70 group-hover/add:text-foreground">
              Add account
            </span>
          </button>
        )}
        {onAddTestAccount && (
          <Hint label="Owner only: add a dummy account with generated mail">
            <button
              type="button"
              onClick={onAddTestAccount}
              className="mt-1 flex w-full items-center gap-[9px] rounded-[5px] border border-dashed border-accent-2/40 bg-accent-2/6 px-1.5 py-[5px] text-left text-accent-2-hover hover:border-accent-2/70 hover:bg-accent-2/10"
            >
              <FlaskConicalIcon className="size-3 shrink-0" />
              <span className="flex-1 text-[12.5px]">Add test account</span>
              <span className="rounded-[3px] border border-dashed border-accent-2/40 px-1 font-mono text-[9px] font-medium tracking-wide uppercase">
                Dev
              </span>
            </button>
          </Hint>
        )}
      </div>
    </div>
  );
}
