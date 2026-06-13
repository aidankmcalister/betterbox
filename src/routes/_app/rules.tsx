import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { Combobox } from "@base-ui/react/combobox";
import {
  Activity,
  CheckIcon,
  ChevronRight,
  GitBranch,
  PencilIcon,
  PlusIcon,
  Spline,
  Trash2Icon,
  Webhook,
  XIcon,
} from "lucide-react";

import type { Account } from "@/lib/account";
import { AccountDot, useAccountColor } from "@/components/account-dot";
import { formatRelative } from "@/lib/format";
import { useAccountsQuery, useAccountsLabels } from "@/lib/mail-queries";
import { LabelDot } from "@/components/tag-picker";
import {
  createRule,
  deleteRule,
  rulesQueryKey,
  setRuleEnabled,
  updateRule,
  useRulesQuery,
  type RuleInput,
} from "@/lib/rule-queries";
import {
  describeRule,
  isRuleValid,
  type Action,
  type ActionType,
  type Condition,
  type ConditionField,
  type MatchMode,
  type Rule,
} from "@/lib/rules";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/rules")({
  component: RulesPage,
});

type Option = { value: string; label: string };

const FIELD_OPTIONS: Option[] = [
  { value: "from", label: "sender" },
  { value: "to", label: "recipient" },
  { value: "subject", label: "subject" },
  { value: "body", label: "body" },
  { value: "hasAttachment", label: "attachment" },
  { value: "label", label: "label" },
];
const TEXT_OPERATOR_OPTIONS: Option[] = [
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
  { value: "is", label: "is exactly" },
  { value: "startsWith", label: "starts with" },
];
const SUBJECT_OPERATOR_OPTIONS: Option[] = [
  ...TEXT_OPERATOR_OPTIONS,
  { value: "endsWith", label: "ends with" },
];
const LABEL_OPERATOR_OPTIONS: Option[] = [
  { value: "is", label: "is" },
  { value: "isNot", label: "is not" },
];
// hasAttachment has no real operator/value — present/absent maps to value.
const ATTACHMENT_OPTIONS: Option[] = [
  { value: "true", label: "is present" },
  { value: "false", label: "is absent" },
];
const ACTION_OPTIONS: Option[] = [
  { value: "label", label: "Apply label" },
  { value: "archive", label: "Archive" },
  { value: "star", label: "Star" },
  { value: "markRead", label: "Mark as read" },
  { value: "trash", label: "Trash" },
  { value: "forward", label: "Forward" },
  { value: "webhook", label: "Trigger webhook" },
];
const ACTION_HINT: Partial<Record<ActionType, string>> = {
  archive: "removes from inbox",
  star: "stars the message",
  markRead: "marks as read",
  trash: "deletes the message",
};

// List columns: expand · active · rule · when→do · accounts · last run · edit
const GRID =
  "grid grid-cols-[24px_44px_minmax(120px,1fr)_minmax(200px,1.4fr)_auto_104px_32px] items-center gap-3";
// Modal condition columns: field · operator · value · remove
const COND_GRID =
  "grid grid-cols-[132px_150px_minmax(0,1fr)_28px] items-center gap-2";
const ACTION_GRID =
  "grid grid-cols-[176px_minmax(0,1fr)_28px] items-center gap-2";

const operatorOptionsFor = (field: ConditionField): Option[] => {
  if (field === "label") return LABEL_OPERATOR_OPTIONS;
  if (field === "subject" || field === "body") return SUBJECT_OPERATOR_OPTIONS;
  return TEXT_OPERATOR_OPTIONS;
};

const emptyCondition = (field: ConditionField = "from"): Condition => ({
  field,
  operator: field === "hasAttachment" || field === "label" ? "is" : "contains",
  value: field === "hasAttachment" ? "true" : "",
});

function RulesPage() {
  const accounts = useAccountsQuery(true).data ?? [];
  const rules = useRulesQuery(true).data ?? [];
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const active = rules.filter((rule) => rule.enabled).length;
  // "Your webhooks" = the distinct URLs already used across existing rules.
  const webhooks = [
    ...new Set(
      rules
        .flatMap((rule) => rule.actions)
        .filter((action) => action.type === "webhook" && action.value)
        .map((action) => action.value as string),
    ),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b px-5">
        <h1 className="text-[18px] leading-none font-semibold tracking-[-0.35px]">
          Rules
        </h1>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {active} active · {rules.length} total · run in order
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          New rule
        </Button>
      </header>

      {rules.length === 0 ? (
        <EmptyRules onStart={() => setEditing("new")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              GRID,
              "sticky top-0 z-10 h-[34px] border-b bg-background px-5 font-mono text-[10.5px] tracking-[0.45px] text-muted-foreground/70 uppercase",
            )}
          >
            <span />
            <span>Active</span>
            <span>Rule</span>
            <span>When → do</span>
            <span>Accounts</span>
            <span className="text-right">Last run</span>
            <span />
          </div>
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              accounts={accounts}
              onEdit={() => setEditing(rule)}
            />
          ))}
          <div className="px-5 py-3">
            <p className="font-mono text-[10.5px] text-muted-foreground/60">
              triggered by the same history poll as webhooks · actions fire via
              gmail.modify
            </p>
            <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground/40">
              the background runner isn’t live yet — rules save and preview, but
              won’t fire until it ships
            </p>
          </div>
        </div>
      )}

      {editing !== null && (
        <RuleModal
          rule={editing === "new" ? null : editing}
          accounts={accounts}
          webhooks={webhooks}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyRules({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <Spline className="size-5 text-muted-foreground/60" />
      <p className="text-[13px] text-muted-foreground">No rules yet</p>
      <Button size="sm" variant="outline" className="mt-1" onClick={onStart}>
        Create your first rule
      </Button>
    </div>
  );
}

function RuleRow({
  rule,
  accounts,
  onEdit,
}: {
  rule: Rule;
  accounts: Account[];
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const toggle = useMutation({
    mutationFn: () => setRuleEnabled(rule.id, !rule.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  });

  const dots = rule.accountIds.length
    ? rule.accountIds
    : accounts.map((a) => a.accountId);
  // "ok" or any 2xx code is a success; everything else (4xx/5xx) is an error.
  const errored =
    rule.lastRunStatus &&
    rule.lastRunStatus !== "ok" &&
    !rule.lastRunStatus.startsWith("2");

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-b">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        className={cn(
          GRID,
          "group h-9 cursor-pointer px-5 text-left transition-colors hover:bg-muted/35",
          open && "bg-muted/25",
          !rule.enabled && "[&>*]:opacity-50",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
          )}
        />
        <div onClick={(e) => e.stopPropagation()} className="w-fit">
          <Switch
            checked={rule.enabled}
            onCheckedChange={() => toggle.mutate()}
            aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
          />
        </div>
        <span className="truncate text-[13px] font-medium text-foreground">
          {rule.name || "Untitled rule"}
        </span>
        <span className="truncate font-mono text-[11.5px] text-muted-foreground/85">
          {describeRule(rule)}
        </span>
        <span className="flex items-center gap-1.5">
          {dots.map((accountId) => {
            const index = accounts.findIndex((a) => a.accountId === accountId);
            const email = accounts[index]?.email ?? accountId;
            return (
              <Hint key={accountId} label={email}>
                <span className="flex items-center">
                  <AccountDot
                    colorIndex={index < 0 ? 0 : index}
                    accountId={accountId}
                  />
                </span>
              </Hint>
            );
          })}
        </span>
        <span className="flex items-center justify-end gap-2 font-mono text-[10.5px] text-muted-foreground">
          {rule.lastRunAt ? formatRelative(rule.lastRunAt) : "never"}
          {rule.lastRunStatus && (
            <StatusPill status={rule.lastRunStatus} errored={!!errored} />
          )}
        </span>
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <Hint label="Edit rule">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit rule"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-[color,opacity,background] group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
            >
              <PencilIcon className="size-3.5" />
            </button>
          </Hint>
        </div>
      </div>

      <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        <RuleCharts />
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function StatusPill({ status, errored }: { status: string; errored: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1 py-px text-[10px] font-medium tabular-nums",
        errored
          ? "bg-label-red/10 text-label-red"
          : "bg-label-green/10 text-label-green",
      )}
    >
      <span
        className={cn(
          "size-1 rounded-full",
          errored ? "bg-label-red" : "bg-label-green",
        )}
      />
      {status}
    </span>
  );
}

const STAT_TILES = [
  { label: "Runs", value: "—" },
  { label: "Matched", value: "—" },
  { label: "Actions", value: "—" },
  { label: "Errors", value: "—" },
];
// 18 weeks × 7 days, empty until the background runner records real runs.
const HEAT_WEEKS = Array.from({ length: 18 });
const HEAT_DAYS = Array.from({ length: 7 });

/** Collapsible per-rule analytics shell. Empty until run data exists; the
 *  GitHub-style heatmap and stat tiles are wired once the runner ships. */
function RuleCharts() {
  return (
    <div className="bg-muted/15 px-5 pt-3.5 pb-4 pl-[52px]">
      <div className="flex items-center gap-2">
        <Activity className="size-3.5 text-muted-foreground/70" />
        <span className="font-mono text-[10.5px] tracking-[0.45px] text-muted-foreground/70 uppercase">
          Run activity
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground/40">
          no data yet — arrives with the background runner
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-[3px]">
            {HEAT_WEEKS.map((_, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {HEAT_DAYS.map((__, d) => (
                  <span
                    key={d}
                    className="size-[9px] rounded-[2px] bg-foreground/[0.06]"
                  />
                ))}
              </div>
            ))}
          </div>
          <span className="font-mono text-[9.5px] text-muted-foreground/40">
            days × time of day
          </span>
        </div>

        <div className="flex gap-2.5">
          {STAT_TILES.map((tile) => (
            <div
              key={tile.label}
              className="flex w-[68px] flex-col gap-0.5 rounded-lg border bg-card px-2.5 py-2"
            >
              <span className="font-mono text-[15px] leading-none font-semibold text-foreground/40 tabular-nums">
                {tile.value}
              </span>
              <span className="font-mono text-[9.5px] tracking-[0.3px] text-muted-foreground/60 uppercase">
                {tile.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const emptyDraft = (accountIds: string[]): RuleInput => ({
  name: null,
  accountIds,
  match: "all",
  conditions: [emptyCondition()],
  actions: [{ type: "archive" }],
  applyToExisting: false,
});

function RuleModal({
  rule,
  accounts,
  webhooks,
  onClose,
}: {
  rule: Rule | null;
  accounts: Account[];
  webhooks: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleInput>(
    rule
      ? {
          name: rule.name,
          accountIds: rule.accountIds.length
            ? rule.accountIds
            : accounts.map((a) => a.accountId),
          match: rule.match,
          conditions: rule.conditions,
          actions: rule.actions,
          applyToExisting: rule.applyToExisting,
        }
      : emptyDraft(accounts.map((a) => a.accountId)),
  );
  const set = (patch: Partial<RuleInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      rule
        ? updateRule(rule.id, draft)
        : createRule(draft).then(() => undefined),
    onSuccess: invalidateAndClose,
  });
  const remove = useMutation({
    mutationFn: () => deleteRule(rule!.id),
    onSuccess: invalidateAndClose,
  });
  const valid = isRuleValid(draft) && draft.accountIds.length > 0;
  const error = save.error;
  // Label pickers pull from the selected inboxes (or all, if none picked yet).
  const labelAccountIds = draft.accountIds.length
    ? draft.accountIds
    : accounts.map((a) => a.accountId);

  const toggleAccount = (accountId: string) =>
    set({
      accountIds: draft.accountIds.includes(accountId)
        ? draft.accountIds.filter((id) => id !== accountId)
        : [...draft.accountIds, accountId],
    });

  const setCondition = (index: number, next: Condition) =>
    set({
      conditions: draft.conditions.map((c, i) => (i === index ? next : c)),
    });
  const setAction = (index: number, next: Action) =>
    set({ actions: draft.actions.map((a, i) => (i === index ? next : a)) });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-2">
          <GitBranch className="size-[18px] text-muted-foreground" />
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>

        <Section label="Name">
          <Input
            placeholder="e.g. Archive GitHub noise"
            value={draft.name ?? ""}
            onChange={(e) => set({ name: e.target.value || null })}
          />
        </Section>

        <Section
          label="Conditions"
          hint={
            <MatchToggle
              value={draft.match}
              onChange={(match) => set({ match })}
            />
          }
        >
          <div className="flex flex-col gap-1.5">
            {draft.conditions.map((condition, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                {index > 0 && (
                  <span className="pl-[2px] font-mono text-[10px] font-semibold tracking-[0.4px] text-muted-foreground/70 uppercase">
                    {draft.match === "any" ? "or" : "and"}
                  </span>
                )}
                <ConditionRow
                  condition={condition}
                  accountIds={labelAccountIds}
                  onChange={(next) => setCondition(index, next)}
                  onRemove={
                    draft.conditions.length > 1
                      ? () =>
                          set({
                            conditions: draft.conditions.filter(
                              (_, i) => i !== index,
                            ),
                          })
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          <AddButton
            onClick={() =>
              set({ conditions: [...draft.conditions, emptyCondition()] })
            }
          >
            add condition
          </AddButton>
        </Section>

        <Section label="Accounts" hint="rule runs on these inboxes">
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((account, index) => (
              <AccountChip
                key={account.accountId}
                email={account.email || account.accountId}
                colorIndex={index}
                accountId={account.accountId}
                checked={draft.accountIds.includes(account.accountId)}
                onToggle={() => toggleAccount(account.accountId)}
              />
            ))}
          </div>
        </Section>

        <Section label="Actions" hint="all actions run, in order">
          <div className="flex flex-col gap-1.5">
            {draft.actions.map((action, index) => (
              <ActionRow
                key={index}
                action={action}
                accountIds={labelAccountIds}
                webhooks={webhooks}
                onChange={(next) => setAction(index, next)}
                onRemove={
                  draft.actions.length > 1
                    ? () =>
                        set({
                          actions: draft.actions.filter((_, i) => i !== index),
                        })
                    : undefined
                }
              />
            ))}
          </div>
          <AddButton
            onClick={() =>
              set({ actions: [...draft.actions, { type: "star" }] })
            }
          >
            add action
          </AddButton>
        </Section>

        <label className="-mt-1 flex w-fit cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground/70 transition-colors hover:text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={draft.applyToExisting}
            onChange={(e) => set({ applyToExisting: e.target.checked })}
          />
          Also sweep existing mail
          <span className="font-mono text-[10.5px] text-muted-foreground/45">
            optional · last 30 days / 500 msgs
          </span>
        </label>

        {error && (
          <p className="text-[12px] text-label-red">
            {(error as Error).message}
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          {rule ? (
            <Hint label="Delete rule">
              <button
                type="button"
                onClick={() => remove.mutate()}
                aria-label="Delete rule"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-label-red/10 hover:text-label-red"
              >
                <Trash2Icon className="size-4" />
              </button>
            </Hint>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending
                ? "Saving…"
                : rule
                  ? "Save changes"
                  : "Create rule"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.5px] text-muted-foreground uppercase">
          {label}
        </span>
        {typeof hint === "string" ? (
          <span className="font-mono text-[11px] text-muted-foreground/60">
            {hint}
          </span>
        ) : (
          hint
        )}
      </div>
      {children}
    </div>
  );
}

function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 w-fit font-mono text-[12px] text-primary transition-opacity hover:opacity-80"
    >
      + {children}
    </button>
  );
}

function MatchToggle({
  value,
  onChange,
}: {
  value: MatchMode;
  onChange: (value: MatchMode) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/60">
      <span>match</span>
      <button
        type="button"
        onClick={() => onChange(value === "all" ? "any" : "all")}
        className="inline-flex h-5 items-center justify-center rounded-[5px] border bg-muted/35 px-2 font-mono text-[10px] leading-none font-semibold tracking-[0.35px] text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Switch to ${value === "all" ? "any" : "all"}`}
      >
        {value === "all" ? "all (AND)" : "any (OR)"}
      </button>
    </div>
  );
}

function ConditionRow({
  condition,
  accountIds,
  onChange,
  onRemove,
}: {
  condition: Condition;
  accountIds: string[];
  onChange: (next: Condition) => void;
  onRemove?: () => void;
}) {
  const isAttachment = condition.field === "hasAttachment";
  const isLabel = condition.field === "label";
  return (
    <div className={cn(COND_GRID, "group")}>
      <FieldSelect
        className="w-full"
        value={condition.field}
        onValueChange={(field) =>
          onChange(emptyCondition(field as ConditionField))
        }
        items={FIELD_OPTIONS}
      />
      {isAttachment ? (
        <>
          <FieldSelect
            className="w-full"
            value={condition.value === "false" ? "false" : "true"}
            onValueChange={(value) =>
              onChange({ ...condition, operator: "is", value })
            }
            items={ATTACHMENT_OPTIONS}
          />
          <span className="font-mono text-[12px] text-muted-foreground/50">
            an attachment
          </span>
        </>
      ) : (
        <>
          <FieldSelect
            className="w-full"
            value={condition.operator}
            onValueChange={(operator) =>
              onChange({
                ...condition,
                operator: operator as Condition["operator"],
              })
            }
            items={operatorOptionsFor(condition.field)}
          />
          {isLabel ? (
            <LabelPicker
              accountIds={accountIds}
              value={condition.value}
              onChange={(value) => onChange({ ...condition, value })}
            />
          ) : (
            <Input
              className="h-7 w-full font-mono text-[12.5px]"
              placeholder={
                condition.field === "subject"
                  ? "[CRITICAL]"
                  : condition.field === "body"
                    ? "unsubscribe"
                    : "@github.com"
              }
              value={condition.value}
              onChange={(e) =>
                onChange({ ...condition, value: e.target.value })
              }
            />
          )}
        </>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function AccountChip({
  email,
  colorIndex,
  accountId,
  checked,
  onToggle,
}: {
  email: string;
  colorIndex: number;
  accountId: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const color = useAccountColor(colorIndex, accountId);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors",
        checked
          ? "border-primary/40 bg-primary/[0.06] text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/50",
      )}
    >
      <span
        className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px]"
        style={
          checked
            ? { background: color }
            : { boxShadow: `inset 0 0 0 1.5px ${color}`, opacity: 0.45 }
        }
      >
        {checked && (
          <CheckIcon className="size-2.5 text-term" strokeWidth={3} />
        )}
      </span>
      {email}
    </button>
  );
}

function ActionRow({
  action,
  accountIds,
  webhooks,
  onChange,
  onRemove,
}: {
  action: Action;
  accountIds: string[];
  webhooks: string[];
  onChange: (next: Action) => void;
  onRemove?: () => void;
}) {
  return (
    <div className={cn(ACTION_GRID, "group")}>
      <FieldSelect
        className="w-full"
        value={action.type}
        onValueChange={(type) =>
          onChange({ type: type as ActionType, value: undefined })
        }
        items={ACTION_OPTIONS}
      />
      {action.type === "label" ? (
        <LabelPicker
          accountIds={accountIds}
          value={action.value ?? ""}
          onChange={(value) => onChange({ ...action, value })}
        />
      ) : action.type === "forward" ? (
        <Input
          className="h-7 w-full"
          type="email"
          placeholder="me@work.com"
          value={action.value ?? ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
        />
      ) : action.type === "webhook" ? (
        <WebhookCombobox
          value={action.value ?? ""}
          suggestions={webhooks}
          onChange={(value) => onChange({ ...action, value })}
        />
      ) : (
        <span className="font-mono text-[12px] text-muted-foreground/60">
          {ACTION_HINT[action.type]}
        </span>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

const WEBHOOK_INPUT_CLASS =
  "h-7 w-full rounded-md border border-input bg-transparent pr-2.5 pl-8 font-mono text-[12px] text-foreground transition-colors outline-none placeholder:font-sans placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/30";

/** Webhook field: pick from URLs already used in your rules, or type/paste a
 *  custom one. With no saved webhooks it's just a plain input (no empty
 *  dropdown); the value is always fully controlled, so freeform never reverts. */
function WebhookCombobox({
  value,
  suggestions,
  onChange,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}) {
  const icon = (
    <Webhook className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/55" />
  );

  if (suggestions.length === 0) {
    return (
      <div className="relative w-full">
        {icon}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="paste a webhook URL…"
          className={WEBHOOK_INPUT_CLASS}
        />
      </div>
    );
  }

  return (
    <Combobox.Root
      items={suggestions}
      inputValue={value}
      onInputValueChange={(next) => onChange(next)}
    >
      <div className="relative w-full">
        {icon}
        <Combobox.Input
          placeholder="pick or paste a webhook URL…"
          className={WEBHOOK_INPUT_CLASS}
        />
      </div>
      <Combobox.Portal>
        <Combobox.Positioner
          className="isolate z-50"
          sideOffset={4}
          align="start"
        >
          <Combobox.Popup className="max-h-72 w-(--anchor-width) min-w-64 origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[opacity,scale] duration-100 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="px-2 pt-1 pb-1.5 font-mono text-[9.5px] tracking-[0.4px] text-muted-foreground/50 uppercase">
              your webhooks
            </div>
            <Combobox.Empty className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground/55">
              no match — what you typed will be used
            </Combobox.Empty>
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 font-mono text-[12px] outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="truncate">{item}</span>
                  <Combobox.ItemIndicator className="absolute right-2 flex items-center">
                    <CheckIcon className="size-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/** Label dropdown across every selected inbox, deduped by name, each with its
 *  colored dot — matching the tag picker. Falls back to a plain input if no
 *  labels have loaded yet. */
function LabelPicker({
  accountIds,
  value,
  onChange,
}: {
  accountIds: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const labels = useAccountsLabels(accountIds);
  if (labels.length === 0) {
    return (
      <Input
        className="h-7 w-full"
        placeholder="label name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const selected = labels.find((label) => label.name === value);
  return (
    <Select
      items={labels.map((label) => ({ value: label.name, label: label.name }))}
      value={value}
      onValueChange={(v) => onChange(String(v))}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          {selected ? (
            <span className="flex items-center gap-2">
              <LabelDot label={selected} />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {labels.map((label) => (
          <SelectItem key={label.id} value={label.name}>
            <span className="flex items-center gap-2">
              <LabelDot label={label} />
              <span className="truncate">{label.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-[color,opacity,background] group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
    >
      <XIcon className="size-3.5" />
    </button>
  );
}

function FieldSelect({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: Option[];
  className?: string;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
    >
      <SelectTrigger size="sm" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
