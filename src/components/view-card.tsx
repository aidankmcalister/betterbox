import { CheckIcon, FlaskConicalIcon, PlusIcon } from "lucide-react";
import { resolveAccountColor } from "@/components/account-dot";
import { useSettings } from "@/hooks/use-settings";
import type { Account } from "@/lib/account";
import { formatCount } from "@/lib/format";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Shared row shape — matches the folder sub-buttons so the account scope reads
 *  as a continuation of the Gmail group's indented list. */
const row =
  "flex h-7 w-full -translate-x-px items-center gap-2 rounded-md px-2 text-left";

/** Loading placeholder for the account scope — a label + two toggle rows so the
 *  indented Gmail list doesn't jump when accounts resolve. Renders <li> rows to
 *  live inside the group's <ul> sub-list. */
export function ViewCardSkeleton() {
  return (
    <>
      <li className="px-2 pt-2 pb-1">
        <span className="block h-2 w-14 animate-pulse rounded bg-muted" />
      </li>
      {[0, 1].map((i) => (
        <li key={i} className="px-2 py-[5px]">
          <div className="flex items-center gap-2">
            <span className="size-3.5 shrink-0 animate-pulse rounded-[4px] bg-muted" />
            <span
              className="h-3 animate-pulse rounded bg-muted/70"
              style={{ width: i === 0 ? "60%" : "46%" }}
            />
          </div>
        </li>
      ))}
    </>
  );
}

/**
 * The Gmail account scope, rendered as borderless toggle rows that live inside
 * the Gmail group's indented sub-list (right of the rule, continuing the
 * folders). Each row's checkbox — filled with the account color — adds or
 * removes that account from the composed "all inboxes" view.
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

  return (
    <>
      <li className="flex items-center gap-2 px-2 pt-2 pb-1">
        <span className="font-mono text-[10px] tracking-[0.5px] text-muted-foreground/60 uppercase">
          Accounts
        </span>
        {!allOn && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
            {inView.length} of {accounts.length}
          </span>
        )}
      </li>

      {accounts.map((account, index) => {
        const on = scopeIds.includes(account.accountId);
        const locked = on && scopeIds.length === 1;
        const color = resolveAccountColor(
          index,
          account.accountId,
          accountColors,
        );
        return (
          <li key={account.accountId} className="relative">
            <Hint
              label={
                on
                  ? locked
                    ? "At least one account stays in view"
                    : `Remove ${account.email} from view`
                  : `Add ${account.email} to view`
              }
            >
              {/* biome-ignore lint/a11y/useSemanticElements: custom toggle using the button + role=checkbox ARIA pattern; a native checkbox can't carry the account-color swatch. */}
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(account.accountId)}
                className={cn(
                  row,
                  locked ? "cursor-default" : "hover:bg-sidebar-accent",
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <span
                    className="flex size-3.5 items-center justify-center rounded-[5px]"
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
                      <CheckIcon
                        className="size-2.5 text-term"
                        strokeWidth={3}
                      />
                    )}
                  </span>
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    on ? "text-sidebar-foreground" : "text-muted-foreground",
                  )}
                >
                  {account.email}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10.5px]",
                    on ? "text-muted-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {formatCount(account.unread)}
                </span>
              </button>
            </Hint>
          </li>
        );
      })}

      {onAddAccount && (
        <li className="relative">
          <button
            type="button"
            onClick={onAddAccount}
            className={cn(
              row,
              "text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              <PlusIcon className="size-3.5" />
            </span>
            <span className="text-[13px]">Add account</span>
          </button>
        </li>
      )}

      {onAddTestAccount && (
        <li className="relative px-1 pt-1">
          <Hint label="Owner only: add a dummy account with generated mail">
            <button
              type="button"
              onClick={onAddTestAccount}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-accent-2/40 bg-accent-2/6 px-2 py-[5px] text-left text-accent-2-hover hover:border-accent-2/70 hover:bg-accent-2/10"
            >
              <FlaskConicalIcon className="size-3 shrink-0" />
              <span className="flex-1 text-[12.5px]">Add test account</span>
              <span className="rounded-[3px] border border-dashed border-accent-2/40 px-1 font-mono text-[9px] font-medium tracking-wide uppercase">
                Dev
              </span>
            </button>
          </Hint>
        </li>
      )}
    </>
  );
}
