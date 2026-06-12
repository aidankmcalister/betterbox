import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckIcon, PlusIcon, Spline, XIcon } from "lucide-react";

import type { Account } from "@/lib/account";
import { AccountDot, useAccountColor } from "@/components/account-dot";
import { formatRelative } from "@/lib/format";
import { useAccountsQuery, useLabelsQuery } from "@/lib/mail-queries";
import {
  createRule,
  deleteRule,
  previewRule,
  rulesQueryKey,
  setRuleEnabled,
  updateRule,
  useRulesQuery,
  type RuleInput,
  type RulePreview,
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/rules")({
  component: RulesPage,
});

type Option = { value: string; label: string };

const FIELD_OPTIONS: Option[] = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "subject", label: "Subject" },
  { value: "hasAttachment", label: "Has attachment" },
];
const OPERATOR_OPTIONS: Option[] = [
  { value: "contains", label: "contains" },
  { value: "is", label: "is" },
];
const BOOL_OPTIONS: Option[] = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
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

const GRID = "grid grid-cols-[40px_minmax(110px,1.1fr)_2.6fr_auto_76px] items-center gap-3";

function RulesPage() {
  const accounts = useAccountsQuery(true).data ?? [];
  const rules = useRulesQuery(true).data ?? [];
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const active = rules.filter((rule) => rule.enabled).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <header className="flex items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-[-0.3px]">
            Rules
            <span className="ml-3 font-mono text-[12px] font-normal text-muted-foreground">
              {active} active · {rules.length} total · run in order
            </span>
          </h1>
          <Button size="sm" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            New rule
          </Button>
        </header>

        {rules.length === 0 ? (
          <EmptyRules onStart={() => setEditing("new")} />
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border">
            <div
              className={cn(
                GRID,
                "border-b bg-muted/30 px-4 py-2 font-mono text-[10.5px] tracking-[0.5px] text-muted-foreground/70 uppercase",
              )}
            >
              <span>Active</span>
              <span>Rule</span>
              <span>When → do</span>
              <span>Accounts</span>
              <span className="text-right">Last run</span>
            </div>
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                accounts={accounts}
                onEdit={() => setEditing(rule)}
              />
            ))}
          </div>
        )}

        <p className="mt-5 font-mono text-[11px] text-muted-foreground/60">
          triggered by the same history poll as webhooks · actions fire via gmail.modify
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground/40">
          the background runner isn’t live yet — rules save and preview, but won’t fire until it ships
        </p>
      </div>

      {editing !== null && (
        <RuleModal
          rule={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyRules({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
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
  const toggle = useMutation({
    mutationFn: () => setRuleEnabled(rule.id, !rule.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  });

  const dots = rule.accountIds.length ? rule.accountIds : accounts.map((a) => a.accountId);
  const errored = rule.lastRunStatus && rule.lastRunStatus !== "ok";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => e.key === "Enter" && onEdit()}
      className={cn(
        GRID,
        "cursor-pointer border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40",
        !rule.enabled && "opacity-50",
      )}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-fit">
        <Switch
          checked={rule.enabled}
          onCheckedChange={() => toggle.mutate()}
          aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
        />
      </div>
      <span className="truncate text-[13px] font-medium">
        {rule.name || "Untitled rule"}
      </span>
      <span className="truncate font-mono text-[11.5px] text-muted-foreground">
        {describeRule(rule)}
      </span>
      <span className="flex items-center gap-1">
        {dots.map((accountId) => {
          const index = accounts.findIndex((a) => a.accountId === accountId);
          return (
            <AccountDot
              key={accountId}
              colorIndex={index < 0 ? 0 : index}
              accountId={accountId}
            />
          );
        })}
      </span>
      <span className="flex items-center justify-end gap-1.5 text-right font-mono text-[11px] text-muted-foreground">
        {errored && (
          <span className="rounded bg-label-red/15 px-1.5 py-0.5 text-label-red">
            {rule.lastRunStatus}
          </span>
        )}
        {rule.lastRunAt ? formatRelative(rule.lastRunAt) : "never"}
      </span>
    </div>
  );
}

const emptyDraft = (accountIds: string[]): RuleInput => ({
  name: null,
  accountIds,
  match: "all",
  conditions: [{ field: "from", operator: "contains", value: "" }],
  actions: [{ type: "archive" }],
  applyToExisting: false,
});

function RuleModal({
  rule,
  accounts,
  onClose,
}: {
  rule: Rule | null;
  accounts: Account[];
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
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const set = (patch: Partial<RuleInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
  };

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      rule ? updateRule(rule.id, draft) : createRule(draft).then(() => undefined),
    onSuccess: invalidateAndClose,
  });
  const remove = useMutation({
    mutationFn: () => deleteRule(rule!.id),
    onSuccess: invalidateAndClose,
  });
  const test = useMutation({ mutationFn: () => previewRule(draft), onSuccess: setPreview });

  const valid = isRuleValid(draft) && draft.accountIds.length > 0;
  const error = save.error ?? test.error;

  const toggleAccount = (accountId: string) =>
    set({
      accountIds: draft.accountIds.includes(accountId)
        ? draft.accountIds.filter((id) => id !== accountId)
        : [...draft.accountIds, accountId],
    });

  const setCondition = (index: number, next: Condition) =>
    set({ conditions: draft.conditions.map((c, i) => (i === index ? next : c)) });
  const setAction = (index: number, next: Action) =>
    set({ actions: draft.actions.map((a, i) => (i === index ? next : a)) });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-2">
          <Spline className="size-[18px] text-muted-foreground" />
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>

        <Section label="Name">
          <Input
            placeholder="e.g. Archive GitHub noise"
            value={draft.name ?? ""}
            onChange={(e) => set({ name: e.target.value || null })}
          />
        </Section>

        <Section label="Apply to">
          <div className="overflow-hidden rounded-lg border">
            {accounts.map((account, index) => (
              <AccountCheck
                key={account.accountId}
                account={account}
                index={index}
                checked={draft.accountIds.includes(account.accountId)}
                onToggle={() => toggleAccount(account.accountId)}
              />
            ))}
          </div>
        </Section>

        <Section
          label="Conditions"
          hint={
            draft.conditions.length > 1 ? (
              <MatchToggle
                value={draft.match}
                onChange={(match) => set({ match })}
              />
            ) : (
              "a message matches when…"
            )
          }
        >
          <div className="flex flex-col gap-2">
            {draft.conditions.map((condition, index) => (
              <ConditionRow
                key={index}
                condition={condition}
                onChange={(next) => setCondition(index, next)}
                onRemove={
                  draft.conditions.length > 1
                    ? () =>
                        set({ conditions: draft.conditions.filter((_, i) => i !== index) })
                    : undefined
                }
              />
            ))}
          </div>
          <AddButton
            onClick={() =>
              set({
                conditions: [
                  ...draft.conditions,
                  { field: "from", operator: "contains", value: "" },
                ],
              })
            }
          >
            add condition
          </AddButton>
        </Section>

        <Section label="Actions" hint="all actions run, in order">
          <div className="flex flex-col gap-2">
            {draft.actions.map((action, index) => (
              <ActionRow
                key={index}
                action={action}
                labelAccountId={draft.accountIds[0]}
                onChange={(next) => setAction(index, next)}
                onRemove={
                  draft.actions.length > 1
                    ? () => set({ actions: draft.actions.filter((_, i) => i !== index) })
                    : undefined
                }
              />
            ))}
          </div>
          <AddButton onClick={() => set({ actions: [...draft.actions, { type: "star" }] })}>
            add action
          </AddButton>
        </Section>

        <Section label="Existing mail" hint="last 30 days or 500 messages, whichever first">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={draft.applyToExisting}
              onChange={(e) => set({ applyToExisting: e.target.checked })}
            />
            Also apply this rule to existing messages in my inbox
          </label>
          {valid && (
            <button
              type="button"
              onClick={() => test.mutate()}
              className="mt-2 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {test.isPending ? "checking…" : "preview matches"}
            </button>
          )}
          {preview && (
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {preview.matched === 0
                ? "no recent mail matches"
                : `${preview.matched}${preview.matched >= 8 ? "+" : ""} recent message${
                    preview.matched === 1 ? "" : "s"
                  } match`}
            </p>
          )}
        </Section>

        {error && <p className="text-[12px] text-label-red">{(error as Error).message}</p>}

        <DialogFooter className="items-center sm:justify-between">
          {rule ? (
            <button
              type="button"
              onClick={() => remove.mutate()}
              className="text-[12px] text-muted-foreground transition-colors hover:text-label-red"
            >
              Delete rule
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : rule ? "Save changes" : "Create rule"}
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
          <span className="font-mono text-[11px] text-muted-foreground/60">{hint}</span>
        ) : (
          hint
        )}
      </div>
      {children}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-fit font-mono text-[12px] text-label-green transition-opacity hover:opacity-80"
    >
      + {children}
    </button>
  );
}

function MatchToggle({ value, onChange }: { value: MatchMode; onChange: (value: MatchMode) => void }) {
  return (
    <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground/60">
      match
      <button
        type="button"
        onClick={() => onChange(value === "all" ? "any" : "all")}
        className="rounded bg-muted px-1.5 py-0.5 text-foreground"
      >
        {value === "all" ? "all (AND)" : "any (OR)"}
      </button>
    </span>
  );
}

function AccountCheck({
  account,
  index,
  checked,
  onToggle,
}: {
  account: Account;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const color = useAccountColor(index, account.accountId);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-[13px] last:border-b-0 hover:bg-muted/40"
    >
      <span className="flex items-center gap-2.5">
        <span
          className="flex size-[18px] items-center justify-center rounded-[5px] border transition-colors"
          style={checked ? { background: color, borderColor: color } : undefined}
        >
          {checked && <CheckIcon className="size-3 text-white" strokeWidth={3} />}
        </span>
        {account.email}
      </span>
      {checked && (
        <span className="font-mono text-[11px] text-muted-foreground/50">will watch</span>
      )}
    </button>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove?: () => void;
}) {
  const isAttachment = condition.field === "hasAttachment";
  return (
    <div className="flex items-center gap-1.5">
      <FieldSelect
        className="w-36"
        value={condition.field}
        onValueChange={(field) =>
          onChange({
            field: field as ConditionField,
            operator: "is",
            value: field === "hasAttachment" ? "false" : "",
          })
        }
        items={FIELD_OPTIONS}
      />
      {isAttachment ? (
        <>
          <span className="px-1 font-mono text-[12px] text-muted-foreground">is</span>
          <FieldSelect
            className="w-24"
            value={condition.value || "false"}
            onValueChange={(value) => onChange({ ...condition, value })}
            items={BOOL_OPTIONS}
          />
        </>
      ) : (
        <>
          <FieldSelect
            className="w-32"
            value={condition.operator}
            onValueChange={(operator) =>
              onChange({ ...condition, operator: operator as Condition["operator"] })
            }
            items={OPERATOR_OPTIONS}
          />
          <Input
            className="h-8 min-w-0 flex-1"
            placeholder={condition.field === "subject" ? "[CRITICAL]" : "@github.com"}
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          />
        </>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function ActionRow({
  action,
  labelAccountId,
  onChange,
  onRemove,
}: {
  action: Action;
  labelAccountId: string | undefined;
  onChange: (next: Action) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FieldSelect
        className="w-44"
        value={action.type}
        onValueChange={(type) => onChange({ type: type as ActionType, value: undefined })}
        items={ACTION_OPTIONS}
      />
      {action.type === "label" ? (
        <LabelPicker
          accountId={labelAccountId}
          value={action.value ?? ""}
          onChange={(value) => onChange({ ...action, value })}
        />
      ) : action.type === "forward" ? (
        <Input
          className="h-8 min-w-0 flex-1"
          type="email"
          placeholder="me@work.com"
          value={action.value ?? ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
        />
      ) : action.type === "webhook" ? (
        <Input
          className="h-8 min-w-0 flex-1"
          placeholder="https://hooks.example.com/…"
          value={action.value ?? ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
        />
      ) : (
        <span className="flex-1 font-mono text-[12px] text-muted-foreground/70">
          {ACTION_HINT[action.type]}
        </span>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function LabelPicker({
  accountId,
  value,
  onChange,
}: {
  accountId: string | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const labels = useLabelsQuery(accountId ?? "").data ?? [];
  if (labels.length === 0) {
    return (
      <Input
        className="h-8 min-w-0 flex-1"
        placeholder="label name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <FieldSelect
      className="min-w-0 flex-1"
      value={value || labels[0].name}
      onValueChange={onChange}
      items={labels.map((label) => ({ value: label.name, label: label.name }))}
    />
  );
}

function RemoveButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label="Remove"
      className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-30"
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
    <Select items={items} value={value} onValueChange={(v) => onValueChange(String(v))}>
      <SelectTrigger className={className}>
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
