import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import type { Account } from "@/lib/account";
import type { ChartDef } from "@/lib/analytics/types";
import { TEAL, CATEGORICAL } from "@/lib/analytics/defs";
import { pctDelta, toSpark, type ChartData, type Delta } from "@/lib/analytics/model";
import { parseStoredTree, type LayoutNode } from "@/lib/layout-tree";
import {
  TileBoard,
  useTileDrag,
  type TileStorage,
} from "@/components/tile-board";
import { resolveAccountColor } from "@/components/account-dot";
import { useSettings } from "@/hooks/use-settings";
import { useChartDefs } from "@/hooks/use-preferences";
import { useChartData, useTopSendersQuery } from "@/lib/mail-queries";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip, type TooltipRow } from "@/components/charts/tooltip";
import { ChartStatFlow } from "@/components/charts/chart-stat-flow";
import { useChart } from "@/components/charts/chart-context";
import {
  Legend,
  LegendItem,
  LegendLabel,
  LegendMarker,
  LegendValue,
} from "@/components/charts/legend";
import { ChartBuilder } from "@/components/chart-builder";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const GRID_STROKE = "color-mix(in srgb, #8a8f98 16%, transparent)";
const CELL_DIVIDERS = {
  boxShadow: "-1px 0 0 var(--color-hairline), 0 -1px 0 var(--color-hairline)",
} as const;

type Range = "7d" | "14d" | "30d";
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "14d": 14, "30d": 30 };

/* The chart *layout* is per-device (it follows the screen, and resize drags
   would spam the DB) — kept in localStorage. The chart *definitions* sync via
   DB preferences (useChartDefs). */
const LAYOUT_KEY = "bm.analytics-layout";
const layoutStorage: TileStorage = {
  load: () => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      return raw ? parseStoredTree(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save: (tree: LayoutNode | null) => {
    try {
      if (tree === null) localStorage.removeItem(LAYOUT_KEY);
      else localStorage.setItem(LAYOUT_KEY, JSON.stringify(tree));
    } catch {
      /* storage unavailable — layout just won't persist */
    }
  },
};

export function AnalyticsView({ accounts }: { accounts: Account[] }) {
  const [range, setRange] = useState<Range>("14d");
  const [building, setBuilding] = useState(false);
  const days = RANGE_DAYS[range];

  // Analytics always covers every linked account; it ignores the sidebar scope.
  const accountIds = useMemo(() => accounts.map((a) => a.accountId), [accounts]);
  const { accountColors } = useSettings();
  const colorOf = (accountId: string) =>
    resolveAccountColor(
      accounts.findIndex((a) => a.accountId === accountId),
      accountId,
      accountColors,
    );
  const emailOf = (accountId: string) =>
    accounts.find((a) => a.accountId === accountId)?.email ?? accountId;

  const { charts, add, remove } = useChartDefs();
  const stats = charts.filter((c) => c.kind === "stat");
  const panels = charts.filter((c) => c.kind !== "stat");

  const ctx = { accountIds, days, colorOf, emailOf, onRemove: remove };

  const panelById = new Map(panels.map((p) => [p.id, p]));
  const paneIds = panels.map((p) => p.id);
  const renderPane = (id: string) => {
    const def = panelById.get(id);
    if (!def) return null;
    return def.kind === "senders" ? (
      <SendersCell def={def} {...ctx} />
    ) : (
      <SeriesCell def={def} {...ctx} />
    );
  };
  const renderDragLabel = (id: string) => (
    <>
      <GripVerticalIcon className="size-3.5 text-muted-foreground" />
      <span className="font-mono text-xs">{panelById.get(id)?.name}</span>
    </>
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-canvas">
      <header className="flex h-[52px] flex-none items-center gap-2.5 border-b border-hairline px-[18px]">
        <h1 className="font-sans text-[18px] font-semibold tracking-[-0.4px] text-ink">
          Analytics
        </h1>
        <span className="font-mono text-[11.5px] text-ink-tertiary">
          {accounts.length === 1 ? accounts[0].email : "all accounts"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 font-mono text-[12px] text-ink-subtle hover:bg-surface-3 hover:text-ink"
          >
            <PlusIcon className="size-3.5" />
            Add custom chart
          </button>
          <div className="flex h-8 items-center rounded-[7px] border border-hairline bg-surface-1 p-0.5">
            {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`h-7 rounded-[5px] px-[11px] font-mono text-[11.5px] transition-colors ${
                  range === r
                    ? "bg-surface-3 text-ink"
                    : "text-ink-subtle hover:text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {stats.length > 0 && (
          <div className="grid flex-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] overflow-hidden border-b border-hairline">
            {stats.map((def) => (
              <StatCell key={def.id} def={def} {...ctx} />
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {paneIds.length > 0 ? (
            <TileBoard
              paneIds={paneIds}
              renderPane={renderPane}
              storage={layoutStorage}
              renderDragLabel={renderDragLabel}
              emptyLabel="No charts yet."
            />
          ) : (
            <div className="grid h-full place-items-center">
              <span className="font-mono text-[12px] text-ink-tertiary">
                No charts — add one above.
              </span>
            </div>
          )}
        </div>
      </div>

      <ChartBuilder open={building} onOpenChange={setBuilding} onAdd={add} />
    </div>
  );
}

// ── shared cell context ──────────────────────────────────────────────────────

type CellCtx = {
  def: ChartDef;
  accountIds: string[];
  days: number;
  colorOf: (accountId: string) => string;
  emailOf: (accountId: string) => string;
  onRemove: (id: string) => void;
};

function Cell({
  def,
  onRemove,
  caption,
  children,
}: {
  def: ChartDef;
  onRemove: (id: string) => void;
  caption?: string;
  children: React.ReactNode;
}) {
  const beginDrag = useTileDrag();
  return (
    <section className="group/cell flex h-full min-w-0 flex-col bg-canvas">
      <div
        onPointerDown={(event) => beginDrag(event, def.id)}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b px-2.5 select-none active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 truncate font-mono text-xs font-medium tracking-[0.4px] text-ink-tertiary uppercase">
          {def.name}
        </span>
        {caption && (
          <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-tertiary">
            {caption}
          </span>
        )}
        <RemoveChart
          name={def.name}
          onConfirm={() => onRemove(def.id)}
          className={caption ? "ml-1.5" : "ml-auto"}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3.5 pt-3 pb-3">
        {children}
      </div>
    </section>
  );
}

/** X button → shadcn confirm dialog. Used by every chart cell so removing one
 *  (including a default) always asks first. */
function RemoveChart({
  name,
  onConfirm,
  className = "",
}: {
  name: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Remove chart"
        onClick={() => setOpen(true)}
        className={`inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 opacity-0 group-hover/cell:opacity-100 hover:bg-muted hover:text-foreground ${className}`}
      >
        <XIcon className="size-3.5" />
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the chart from your analytics. You can add it back any
              time with “Add custom chart”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── stat cell (KPI: today + delta + sparkline) ───────────────────────────────

function StatCell(props: CellCtx) {
  const { def, accountIds, days, onRemove } = props;
  const query = useChartData(accountIds, def.series, days);
  const total = query.data?.series[0]?.total ?? [];
  const dates = query.data?.dates ?? [];
  const today = total[total.length - 1] ?? 0;
  const delta = pctDelta(today, total[total.length - 2] ?? 0);
  const spark = toSpark(dates, total);

  return (
    <div
      className="group/cell relative flex min-w-0 flex-col px-[18px] pt-3.5 pb-3"
      style={CELL_DIVIDERS}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate font-sans text-[11.5px] text-ink-subtle">
          {def.name}
        </span>
        {total.length > 1 && <DeltaPill delta={delta} />}
        <RemoveChart
          name={def.name}
          onConfirm={() => onRemove(def.id)}
          className={total.length > 1 ? "ml-1.5" : "ml-auto"}
        />
      </div>
      <StatNumber value={today} sub="today" spark={spark} />
    </div>
  );
}

function StatNumber({
  value,
  sub,
  spark,
}: {
  value: number;
  sub: string;
  spark: { date: string; v: number }[];
}) {
  const [hover, setHover] = useState<HoverState>({ value: null, label: null });
  return (
    <>
      <div className="flex flex-col items-start">
        <ChartStatFlow
          value={hover.value ?? value}
          label={hover.label ?? sub}
          valueClassName="font-sans text-[25px] leading-none font-semibold tracking-[-0.9px] text-ink"
          labelClassName="mt-1.5 font-mono text-[10.5px] text-ink-tertiary"
        />
      </div>
      {spark.length > 1 ? (
        <AreaChart
          data={spark}
          xDataKey="date"
          aspectRatio="auto"
          style={{ height: 30 }}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          animationDuration={0}
          className="mt-2.5"
        >
          <StatHoverBridge dataKey="v" onHoverChange={setHover} />
          <Area
            dataKey="v"
            stroke={TEAL.bright}
            strokeWidth={1.5}
            fill={TEAL.base}
            fillOpacity={0.34}
            gradientToOpacity={0}
            fadeEdges="left"
          />
        </AreaChart>
      ) : (
        <div className="mt-2.5 flex h-[30px] items-center">
          <div className="h-px w-full bg-hairline" />
        </div>
      )}
    </>
  );
}

// ── series cell (panel: area/line, per-account or per-query) ──────────────────

function SeriesCell(props: CellCtx) {
  const { def, accountIds, days, colorOf, emailOf, onRemove } = props;
  const query = useChartData(accountIds, def.series, days);
  const lines = useMemo(
    () => toLines(query.data, def, colorOf, emailOf),
    [query.data, def, colorOf, emailOf],
  );
  const chartData = useMemo(() => toChartRows(query.data, lines), [query.data, lines]);
  const isLine = def.type === "line";

  return (
    <Cell def={def} onRemove={onRemove} caption={`last ${days}d`}>
      {lines.length > 1 && (
        <Legend
          items={lines.map((l) => ({
            label: l.label,
            value: l.values.reduce((s, n) => s + n, 0),
            color: l.color,
          }))}
          className="mb-3 flex-row flex-wrap items-center gap-x-4 gap-y-1"
        >
          <LegendItem className="flex items-center gap-1.5">
            <LegendMarker className="size-1.5" />
            <LegendLabel className="font-sans text-[11.5px] text-ink-subtle" />
            <LegendValue className="font-mono text-[11px] text-ink-tertiary tabular-nums" />
          </LegendItem>
        </Legend>
      )}
      <div className="min-h-[140px] flex-1">
        <AreaChart
          data={chartData}
          xDataKey="date"
          aspectRatio="auto"
          style={{ height: "100%" }}
          margin={{ top: 8, right: 8, bottom: 38, left: 8 }}
          animationDuration={0}
        >
          <Grid numTicksRows={4} stroke={GRID_STROKE} strokeDasharray="3 5" />
          {lines.map((l) => (
            <Area
              key={l.key}
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={1.75}
              fill={l.color}
              fillOpacity={isLine ? 0 : 0.26}
              gradientToOpacity={isLine ? 0 : 0.02}
              fadeEdges
            />
          ))}
          <XAxis numTicks={5} />
          <ChartTooltip rows={(point) => lineRows(point, lines)} />
        </AreaChart>
      </div>
    </Cell>
  );
}

// ── senders cell (ranked bars) ───────────────────────────────────────────────

function SendersCell(props: CellCtx) {
  const { def, accountIds, colorOf, onRemove } = props;
  const query = useTopSendersQuery(accountIds);
  const senders = query.data ?? [];
  const max = Math.max(1, ...senders.map((s) => s.count));

  return (
    <Cell def={def} onRemove={onRemove} caption="30d">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-0.5">
        {senders.map((s, i) => (
          <div key={s.email} className="flex items-center gap-2.5">
            <span className="w-[13px] flex-none font-mono text-[10.5px] text-ink-tertiary">
              {i + 1}
            </span>
            <Dot color={colorOf(s.accountId)} />
            <span
              title={s.email}
              className="min-w-[56px] flex-[0_1_92px] truncate font-sans text-[12.5px] text-ink-muted"
            >
              {s.name}
            </span>
            <Bar
              ratio={s.count / max}
              fill={`linear-gradient(90deg, ${TEAL.deep}, ${TEAL.bright})`}
            />
            <span className="w-9 flex-none text-right font-mono text-[11.5px] text-ink">
              {s.count}
            </span>
          </div>
        ))}
        {query.isLoading && (
          <span className="font-mono text-[10.5px] text-ink-tertiary">
            loading…
          </span>
        )}
      </div>
    </Cell>
  );
}

// ── chart helpers ────────────────────────────────────────────────────────────

type RenderLine = { key: string; label: string; color: string; values: number[] };

/** Decide the lines for a series chart: one per account (account colors) when
 *  split, else one per query (categorical palette). */
function toLines(
  data: ChartData | undefined,
  def: ChartDef,
  colorOf: (id: string) => string,
  emailOf: (id: string) => string,
): RenderLine[] {
  if (!data) return [];
  if (def.splitByAccount) {
    return (data.series[0]?.byAccount ?? []).map((a, i) => ({
      key: `k${i}`,
      label: emailOf(a.accountId),
      color: colorOf(a.accountId),
      values: a.values,
    }));
  }
  return data.series.map((s, i) => ({
    key: `k${i}`,
    label: s.label,
    color: CATEGORICAL[i % CATEGORICAL.length],
    values: s.total,
  }));
}

function toChartRows(data: ChartData | undefined, lines: RenderLine[]) {
  if (!data) return [];
  return data.dates.map((date, di) => {
    const row: Record<string, unknown> = { date };
    for (const l of lines) row[l.key] = l.values[di] ?? 0;
    return row;
  });
}

function lineRows(
  point: Record<string, unknown>,
  lines: RenderLine[],
): TooltipRow[] {
  const rows: TooltipRow[] = lines.map((l) => ({
    color: l.color,
    label: l.label,
    value: Number(point[l.key] ?? 0).toLocaleString(),
  }));
  if (lines.length > 1) {
    const total = lines.reduce((s, l) => s + Number(point[l.key] ?? 0), 0);
    rows.push({ color: "transparent", label: "total", value: total.toLocaleString() });
  }
  return rows;
}

// ── hover bridge + small pieces ──────────────────────────────────────────────

type HoverState = { value: number | null; label: string | null };

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function StatHoverBridge({
  dataKey,
  onHoverChange,
}: {
  dataKey: string;
  onHoverChange: (state: HoverState) => void;
}) {
  const { tooltipData } = useChart();
  useEffect(() => {
    if (!tooltipData?.point) {
      onHoverChange({ value: null, label: null });
      return;
    }
    const raw = tooltipData.point[dataKey];
    const rawDate = tooltipData.point.date;
    const date = typeof rawDate === "string" ? new Date(rawDate) : null;
    onHoverChange({
      value: typeof raw === "number" ? raw : null,
      label: date && !Number.isNaN(date.getTime()) ? dayLabel(date) : null,
    });
  }, [tooltipData, dataKey, onHoverChange]);
  return null;
}

function DeltaPill({ delta }: { delta: Delta }) {
  const color = delta.neutral
    ? "var(--color-ink-tertiary)"
    : delta.good
      ? "var(--color-success)"
      : "var(--color-label-red)";
  return (
    <span
      className="ml-auto inline-flex h-5 items-center gap-1 rounded-full px-2 font-mono text-[10.5px] whitespace-nowrap"
      style={{
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        background: `color-mix(in srgb, ${color} 7%, transparent)`,
      }}
    >
      {!delta.neutral &&
        (delta.good ? (
          <ChevronUpIcon className="size-3" strokeWidth={2.5} />
        ) : (
          <ChevronDownIcon className="size-3" strokeWidth={2.5} />
        ))}
      {delta.label}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="size-1.5 flex-none rounded-full"
      style={{ background: color }}
    />
  );
}

function Bar({ ratio, fill }: { ratio: number; fill: string }) {
  return (
    <span className="h-[7px] flex-[1_0_60px] overflow-hidden rounded-full bg-surface-3">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          background: fill,
        }}
      />
    </span>
  );
}
