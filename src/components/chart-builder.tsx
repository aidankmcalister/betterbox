import { useEffect, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";

import type { ChartDef, ChartType, QuerySeries } from "@/lib/analytics/types";
import { QUERY_PRESETS } from "@/lib/analytics/defs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Math.round(performance.now())}`;

const blankSeries = (): QuerySeries => ({ label: "", q: "" });

/**
 * Build a custom chart: a name, area/line style, optionally split per account,
 * and one or more Gmail-search series. Each series is a real query counted per
 * day — so users can chart literally anything Gmail search can express.
 */
export function ChartBuilder({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (def: ChartDef) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ChartType>("area");
  const [splitByAccount, setSplitByAccount] = useState(false);
  const [series, setSeries] = useState<QuerySeries[]>([blankSeries()]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setType("area");
    setSplitByAccount(false);
    setSeries([blankSeries()]);
  }, [open]);

  const cleaned = series
    .map((s) => ({ label: s.label.trim() || s.q.trim(), q: s.q.trim() }))
    .filter((s) => s.q.length > 0);
  const canSave = name.trim().length > 0 && cleaned.length > 0;

  // Splitting per account only makes sense for a single query (one line each).
  const multi = series.length > 1;

  const save = () => {
    if (!canSave) return;
    onAdd({
      id: newId(),
      name: name.trim(),
      kind: "series",
      type,
      splitByAccount: splitByAccount && !multi,
      series: cleaned,
    });
    onOpenChange(false);
  };

  const setRow = (i: number, patch: Partial<QuerySeries>) =>
    setSeries((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add custom chart</DialogTitle>
          <DialogDescription>
            Each series is a Gmail search, counted per day over the selected
            range.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Newsletters vs Receipts"
            />
          </Field>

          <div className="flex items-center gap-6">
            <Field label="Style">
              <div className="flex rounded-md border border-input p-0.5">
                {(["area", "line"] as ChartType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`h-7 rounded-[5px] px-3 font-mono text-[11.5px] capitalize ${
                      type === t
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            {!multi && (
              <Field label="Split by account">
                <div className="flex h-8 items-center">
                  <Switch
                    checked={splitByAccount}
                    onCheckedChange={setSplitByAccount}
                  />
                </div>
              </Field>
            )}
          </div>

          <Field
            label={multi ? "Series (one line each)" : "Series"}
            hint={
              splitByAccount && !multi
                ? "One line per account, in account colors"
                : undefined
            }
          >
            <div className="flex flex-col gap-2">
              {series.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={QUERY_PRESETS.some((p) => p.q === row.q) ? row.q : ""}
                    onValueChange={(value) => {
                      const preset = QUERY_PRESETS.find((p) => p.q === value);
                      if (preset)
                        setRow(i, { q: preset.q, label: preset.label });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-[116px] shrink-0 font-mono text-[12px]"
                    >
                      <SelectValue placeholder="Preset…" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUERY_PRESETS.map((p) => (
                        <SelectItem key={p.q} value={p.q}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={row.q}
                    onChange={(e) => setRow(i, { q: e.target.value })}
                    placeholder="gmail query, e.g. from:github.com"
                    className="flex-1 font-mono text-[12px]"
                  />
                  {series.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove series"
                      onClick={() =>
                        setSeries((rows) => rows.filter((_, j) => j !== i))
                      }
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSeries((rows) => [...rows, blankSeries()])}
                className="inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <PlusIcon className="size-3.5" />
                Add series
              </button>
            </div>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={save}>
            Add chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="font-mono text-[10.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
