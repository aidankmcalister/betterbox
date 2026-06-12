import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GitBranchIcon, PlusIcon, Trash2Icon } from "lucide-react";

import type { Account } from "@/lib/account";
import { useAccountsQuery, useLabelsQuery } from "@/lib/mail-queries";
import {
  createRule,
  deleteRule,
  previewRule,
  rulesQueryKey,
  setRuleEnabled,
  useRulesQuery,
  type RuleInput,
  type RulePreview,
} from "@/lib/rule-queries";
import {
  describeActions,
  describeCondition,
  ruleHasAction,
  type Rule,
  type RuleField,
} from "@/lib/rules";
import { Button } from "@/components/ui/button";
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

type Option = { value: string; label: string };

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

export const Route = createFileRoute("/_app/rules")({
  component: RulesPage,
});

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

const NO_LABEL = "__none__";

function RulesPage() {
  const accounts = useAccountsQuery(true).data ?? [];
  const rules = useRulesQuery(true).data ?? [];
  const [building, setBuilding] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.3px]">
              <GitBranchIcon className="size-5 text-muted-foreground" />
              Rules
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              When a message matches, BetterBox acts on it — labeling, archiving,
              forwarding. One engine, run per account. No Gmail filters.
            </p>
          </div>
          {!building && (
            <Button size="sm" onClick={() => setBuilding(true)}>
              <PlusIcon data-icon="inline-start" />
              New rule
            </Button>
          )}
        </header>

        {building && (
          <RuleBuilder
            accounts={accounts}
            onClose={() => setBuilding(false)}
          />
        )}

        <div className="mt-6 flex flex-col gap-2">
          {rules.length === 0 && !building ? (
            <EmptyRules onStart={() => setBuilding(true)} />
          ) : (
            rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} accounts={accounts} />
            ))
          )}
        </div>

        <p className="mt-8 font-mono text-[11px] leading-relaxed text-muted-foreground/60">
          Rules run when BetterBox’s backend is running. Scheduled execution (the
          background runner that fires them on every new message) is next — for
          now, “Test” previews what a rule would catch.
        </p>
      </div>
    </div>
  );
}

function EmptyRules({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <GitBranchIcon className="size-5 text-muted-foreground/60" />
      <p className="text-[13px] text-muted-foreground">No rules yet</p>
      <Button size="sm" variant="outline" className="mt-1" onClick={onStart}>
        Create your first rule
      </Button>
    </div>
  );
}

function accountLabel(accounts: Account[], accountId: string) {
  if (accountId === "all") return "all accounts";
  return accounts.find((a) => a.accountId === accountId)?.email ?? "an account";
}

function RuleCard({ rule, accounts }: { rule: Rule; accounts: Account[] }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: rulesQueryKey });

  const toggle = useMutation({
    mutationFn: () => setRuleEnabled(rule.id, !rule.enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteRule(rule.id),
    onSuccess: invalidate,
  });

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3",
        !rule.enabled && "opacity-55",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">
          {rule.name ?? describeCondition(rule)}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {describeCondition(rule)} → {describeActions(rule).join(", ")}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {accountLabel(accounts, rule.accountId)}
        </p>
      </div>
      <Switch
        checked={rule.enabled}
        onCheckedChange={() => toggle.mutate()}
        aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
      />
      <button
        type="button"
        onClick={() => remove.mutate()}
        className="text-muted-foreground/60 transition-colors hover:text-label-red"
        aria-label="Delete rule"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}

const emptyDraft: RuleInput = {
  accountId: "all",
  name: null,
  field: "from",
  operator: "contains",
  value: "",
  doArchive: false,
  doMarkRead: false,
  doStar: false,
  doTrash: false,
  labelId: null,
  forwardTo: null,
};

function RuleBuilder({
  accounts,
  onClose,
}: {
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleInput>(emptyDraft);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const set = (patch: Partial<RuleInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
  };

  const save = useMutation({
    mutationFn: () => createRule(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesQueryKey });
      onClose();
    },
  });
  const test = useMutation({
    mutationFn: () => previewRule(draft),
    onSuccess: setPreview,
  });

  const needsValue = draft.field !== "hasAttachment";
  const valid =
    (!needsValue || draft.value.trim().length > 0) && ruleHasAction(draft);
  const error = save.error ?? test.error;

  return (
    <div className="mt-5 flex flex-col gap-4 rounded-xl border bg-card p-4">
      <Field label="When mail in">
        <FieldSelect
          value={draft.accountId}
          onValueChange={(accountId) =>
            set({ accountId, labelId: accountId === "all" ? null : draft.labelId })
          }
          items={[
            { value: "all", label: "all accounts" },
            ...accounts.map((account) => ({
              value: account.accountId,
              label: account.email,
            })),
          ]}
        />
      </Field>

      <Field label="Matches">
        <FieldSelect
          value={draft.field}
          onValueChange={(field) => set({ field: field as RuleField })}
          items={FIELD_OPTIONS}
        />
        {needsValue && (
          <>
            <FieldSelect
              value={draft.operator}
              onValueChange={(operator) =>
                set({ operator: operator as "contains" | "is" })
              }
              items={OPERATOR_OPTIONS}
            />
            <Input
              className="h-8 min-w-32 flex-1"
              placeholder={draft.field === "subject" ? "[CRITICAL]" : "@github.com"}
              value={draft.value}
              onChange={(e) => set({ value: e.target.value })}
            />
          </>
        )}
      </Field>

      <Field label="Then">
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionChip on={draft.doStar} onClick={() => set({ doStar: !draft.doStar })}>
            Star
          </ActionChip>
          <ActionChip on={draft.doMarkRead} onClick={() => set({ doMarkRead: !draft.doMarkRead })}>
            Mark read
          </ActionChip>
          <ActionChip on={draft.doArchive} onClick={() => set({ doArchive: !draft.doArchive })}>
            Archive
          </ActionChip>
          <ActionChip on={draft.doTrash} onClick={() => set({ doTrash: !draft.doTrash })}>
            Trash
          </ActionChip>
        </div>
      </Field>

      {draft.accountId !== "all" && (
        <Field label="Label">
          <LabelActionPicker
            accountId={draft.accountId}
            value={draft.labelId}
            onChange={(labelId) => set({ labelId })}
          />
        </Field>
      )}

      <Field label="Forward to">
        <Input
          className="h-8 flex-1"
          type="email"
          placeholder="optional — me@work.com"
          value={draft.forwardTo ?? ""}
          onChange={(e) => set({ forwardTo: e.target.value || null })}
        />
      </Field>

      {preview && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-[12px]">
          <p className="font-medium">
            {preview.matched === 0
              ? "No recent mail matches this."
              : `${preview.matched}${preview.matched >= 8 ? "+" : ""} recent message${
                  preview.matched === 1 ? "" : "s"
                } would match:`}
          </p>
          {preview.samples.map((sample, i) => (
            <p key={i} className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {sample.from} — {sample.subject}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[12px] text-label-red">{(error as Error).message}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!valid || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? "Testing…" : "Test"}
        </Button>
        <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save rule"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function ActionChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-[12px] transition-colors",
        on
          ? "border-primary bg-primary text-on-primary"
          : "bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function LabelActionPicker({
  accountId,
  value,
  onChange,
}: {
  accountId: string;
  value: string | null;
  onChange: (labelId: string | null) => void;
}) {
  const labels = useLabelsQuery(accountId).data ?? [];
  return (
    <FieldSelect
      value={value ?? NO_LABEL}
      onValueChange={(next) => onChange(next === NO_LABEL ? null : next)}
      items={[
        { value: NO_LABEL, label: "No label" },
        ...labels.map((label) => ({ value: label.id, label: label.name })),
      ]}
    />
  );
}
