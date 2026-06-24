import { CheckIcon, FlaskConicalIcon, PlusIcon } from "lucide-react";
import { resolveAccountColor } from "@/components/account-dot";
import { useSettings } from "@/hooks/use-settings";
import type { Account } from "@/lib/account";
import { formatCount } from "@/lib/format";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const row = "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left";

/**
 * The Gmail account scope — borderless toggle rows. Each row's checkbox, filled
 * with the account color, adds or removes that inbox from the composed board
 * view. Lives in the sidebar's pinned "Accounts" footer (route-independent), so
 * it never reflows when you switch integrations.
 */
export function ViewCard({
  accounts,
  scopeIds,
  onToggle,
  onAddAccount,
  onAddTestAccount,
}: {
  accounts: Account[];
  scopeIds: string[];
  onToggle: (id: string | "all") => void;
  onAddAccount?: () => void;
  onAddTestAccount?: () => void;
}) {
  const { accountColors } = useSettings();

  return (
    <div className="flex flex-col gap-px">
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
                    <CheckIcon className="size-2.5 text-term" strokeWidth={3} />
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
        );
      })}

      {onAddAccount && (
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
      )}

      {onAddTestAccount && (
        <Hint label="Owner only: add a dummy account with generated mail">
          <button
            type="button"
            onClick={onAddTestAccount}
            className="mt-0.5 flex w-full items-center gap-2 rounded-md border border-dashed border-accent-2/40 bg-accent-2/6 px-2 py-[5px] text-left text-accent-2-hover hover:border-accent-2/70 hover:bg-accent-2/10"
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
  );
}
