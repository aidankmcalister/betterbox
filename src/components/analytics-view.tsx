import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import type { Account } from "@/lib/account";
import { resolveAccountColor } from "@/components/account-dot";
import { useSettings } from "@/hooks/use-settings";
import { useAnalyticsQuery } from "@/lib/mail-queries";
import {
  buildAnalyticsModel,
  pctDelta,
  sliceSeries,
  type Delta,
} from "@/lib/analytics-model";
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

/* Aggregate sparklines use the dev teal; multi-account series are colored by
   each account's own color (Settings → Accounts) so they match its sidebar dot. */
const TEAL = { bright: "#3edbc8", base: "#1fb8a6", deep: "#0f7c6f" };
const GRID_STROKE = "color-mix(in srgb, #8a8f98 16%, transparent)";

type Range = "7d" | "14d" | "30d";
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "14d": 14, "30d": 30 };

type Spark = { date: string; v: number }[];

export function AnalyticsView({
  accounts,
  scopeIds,
}: {
  accounts: Account[];
  scopeIds: string[];
}) {
  const [range, setRange] = useState<Range>("14d");
  const query = useAnalyticsQuery(scopeIds);
  const results = useMemo(() => query.data ?? [], [query.data]);

  const accountIndex = useMemo(
    () => new Map(accounts.map((a, i) => [a.accountId, i])),
    [accounts],
  );

  const scoped = accounts.filter((a) => scopeIds.includes(a.accountId));
  const scopeLabel =
    scoped.length === accounts.length
      ? "all accounts"
      : scoped.length === 1
        ? scoped[0].email
        : scoped.map((a) => a.email.split("@")[0]).join(" + ");

  const model = useMemo(
    () => buildAnalyticsModel(results, accounts),
    [results, accounts],
  );
  const days = RANGE_DAYS[range];
  const sliceFrom = Math.max(0, model.dates.length - days);
  const visibleDays = model.dates.length - sliceFrom;

  // Per-account color (Settings override → falls back to list position), same
  // source AccountDot uses, so a series matches that account's sidebar dot.
  const { accountColors } = useSettings();
  const colorOf = (accountId: string) =>
    resolveAccountColor(accountIndex.get(accountId) ?? 0, accountId, accountColors);

  /* model.series (busiest first) enriched with color + range total. Index i
     here lines up with the hero's `a${i}` data keys. */
  const seriesView = model.series.map((s) => ({
    accountId: s.accountId,
    email: s.email,
    color: colorOf(s.accountId),
    rangeReceived: s.received.slice(sliceFrom).reduce((sum, n) => sum + n, 0),
  }));
  const byAccount = [...seriesView].sort(
    (a, b) => b.rangeReceived - a.rangeReceived,
  );
  const maxAccount = Math.max(1, ...byAccount.map((a) => a.rangeReceived));

  // ── KPI values ──────────────────────────────────────────────────────────────
  const last = model.dates.length - 1;
  const receivedToday = model.totalReceived[last] ?? 0;
  const sentToday = model.totalSent[last] ?? 0;
  const receivedDelta = pctDelta(receivedToday, model.totalReceived[last - 1] ?? 0);
  const sentDelta = pctDelta(sentToday, model.totalSent[last - 1] ?? 0);
  const unread = scoped.reduce((sum, a) => sum + a.unread, 0);
  const receivedRange = model.totalReceived
    .slice(sliceFrom)
    .reduce((sum, n) => sum + n, 0);

  const receivedSpark = sliceSeries(model.dates, model.totalReceived, sliceFrom);
  const sentSpark = sliceSeries(model.dates, model.totalSent, sliceFrom);

  // ── hero: one gradient-area series per account, in account colors ──────────
  const heroData = model.dates.slice(sliceFrom).map((date, i) => {
    const row: Record<string, unknown> = { date };
    let total = 0;
    model.series.forEach((s, idx) => {
      const v = s.received[sliceFrom + i] ?? 0;
      row[`a${idx}`] = v;
      total += v;
    });
    row.total = total;
    return row;
  });
  // Draw busiest last so its fill sits on top of the others.
  const drawOrder = seriesView.map((_, idx) => idx).reverse();

  return (
    <div className="flex h-full min-w-0 flex-col bg-canvas">
      {/* header */}
      <div className="flex h-[52px] flex-none items-center gap-2.5 border-b border-hairline px-[18px]">
        <h2 className="font-sans text-[18px] font-semibold tracking-[-0.4px] text-ink">
          Analytics
        </h2>
        <span className="font-mono text-[11.5px] text-ink-tertiary">
          {scopeLabel}
        </span>
        <div className="ml-auto flex rounded-[7px] border border-hairline bg-surface-1 p-0.5">
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`h-6 rounded-[5px] px-[11px] font-mono text-[11.5px] transition-colors ${
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

      <div className="min-h-0 flex-1 overflow-y-auto p-[18px]">
        {query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : model.series.length === 0 && !query.isLoading ? (
          <EmptyState />
        ) : (
          <>
            {/* KPI strip — hover a sparkline to read that day's value */}
            <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(185px,1fr))] gap-3">
              <StatCard
                label="Received"
                value={receivedToday}
                sub="today · all accounts"
                delta={receivedDelta}
                spark={receivedSpark}
              />
              <StatCard
                label="Sent"
                value={sentToday}
                sub="today · all accounts"
                delta={sentDelta}
                spark={sentSpark}
              />
              <StatCard
                label="Unread"
                value={unread}
                sub={scoped.length === 1 ? "in this inbox" : "across accounts"}
              />
              <StatCard
                label={`Received · ${visibleDays}d`}
                value={receivedRange}
                sub="all accounts"
                spark={receivedSpark}
              />
            </div>

            {/* hero — message volume, one area per account */}
            <Card
              title="Message volume"
              caption={`received · last ${visibleDays} days`}
              className="mb-3.5"
            >
              <Legend
                items={seriesView.map((s) => ({
                  label: s.email,
                  value: s.rangeReceived,
                  color: s.color,
                }))}
                className="mb-3 flex-row flex-wrap items-center gap-x-4 gap-y-1"
              >
                <LegendItem className="flex items-center gap-1.5">
                  <LegendMarker className="size-1.5" />
                  <LegendLabel className="font-sans text-[11.5px] text-ink-subtle" />
                  <LegendValue className="font-mono text-[11px] text-ink-tertiary tabular-nums" />
                </LegendItem>
              </Legend>
              <AreaChart
                data={heroData}
                xDataKey="date"
                aspectRatio="auto"
                style={{ height: 240 }}
                margin={{ top: 8, right: 10, bottom: 28, left: 10 }}
                animationDuration={0}
              >
                <Grid numTicksRows={5} stroke={GRID_STROKE} strokeDasharray="3 5" />
                {drawOrder.map((idx) => (
                  <Area
                    key={idx}
                    dataKey={`a${idx}`}
                    stroke={seriesView[idx].color}
                    strokeWidth={1.75}
                    fill={seriesView[idx].color}
                    fillOpacity={0.28}
                    gradientToOpacity={0.02}
                    fadeEdges={false}
                  />
                ))}
                <XAxis numTicks={5} />
                <ChartTooltip rows={(point) => heroRows(point, seriesView)} />
              </AreaChart>
            </Card>

            {/* bottom row */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-3.5">
              <Card title="Top senders" caption="30d">
                <div className="flex flex-col gap-3 pt-0.5">
                  {model.topSenders.map((s, i) => (
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
                        ratio={s.count / model.maxSender}
                        fill={`linear-gradient(90deg, ${TEAL.deep}, ${TEAL.bright})`}
                      />
                      <span className="w-9 flex-none text-right font-mono text-[11.5px] text-ink">
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Received by account" caption={`last ${visibleDays}d`}>
                <div className="flex flex-col gap-3 pt-0.5">
                  {byAccount.map((a) => (
                    <div key={a.accountId} className="flex items-center gap-2.5">
                      <Dot color={a.color} />
                      <span
                        title={a.email}
                        className="min-w-[56px] flex-[0_1_150px] truncate font-mono text-[11.5px] text-ink-muted"
                      >
                        {a.email}
                      </span>
                      <Bar ratio={a.rangeReceived / maxAccount} fill={a.color} />
                      <span className="w-12 flex-none text-right font-mono text-[11.5px] text-ink">
                        {a.rangeReceived.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── hover bridge + tooltip rows ──────────────────────────────────────────────

type HoverState = { value: number | null; label: string | null };

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function parsePointDate(raw: unknown): Date | null {
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Lives inside a chart; syncs the hovered point's value + date up to the card
 *  so the big stat number tracks the cursor (bklit's stat-card pattern). */
function StatCardHoverBridge({
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
    const date = parsePointDate(tooltipData.point.date);
    onHoverChange({
      value: typeof raw === "number" ? raw : null,
      label: date ? dayLabel(date) : null,
    });
  }, [tooltipData, dataKey, onHoverChange]);
  return null;
}

/** Hover tooltip rows for the volume hero: one per account (email · value in
 *  its color), then a total row. `point` is bklit's hovered data row. */
function heroRows(
  point: Record<string, unknown>,
  series: { email: string; color: string }[],
): TooltipRow[] {
  const rows: TooltipRow[] = series.map((s, idx) => ({
    color: s.color,
    label: s.email,
    value: Number(point[`a${idx}`] ?? 0).toLocaleString(),
  }));
  rows.push({
    color: "transparent",
    label: "total",
    value: Number(point.total ?? 0).toLocaleString(),
  });
  return rows;
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Card({
  title,
  caption,
  className = "",
  children,
}: {
  title: string;
  caption?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-w-0 rounded-[11px] border border-hairline bg-surface-1 px-[18px] pt-[15px] pb-4 ${className}`}
    >
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <span className="whitespace-nowrap font-sans text-[13px] font-semibold text-ink">
          {title}
        </span>
        {caption && (
          <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-ink-tertiary">
            {caption}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** KPI card: big number (NumberFlow) that re-reads to the hovered day's value
 *  when you scrub the flush sparkline, with a delta pill. */
function StatCard({
  label,
  value,
  sub,
  delta,
  spark,
}: {
  label: string;
  value: number;
  sub: string;
  delta?: Delta;
  spark?: Spark;
}) {
  const [hover, setHover] = useState<HoverState>({ value: null, label: null });
  const shownValue = hover.value ?? value;
  const shownSub = hover.label ?? sub;

  return (
    <div className="flex flex-col overflow-hidden rounded-[11px] border border-hairline bg-surface-1">
      <div className="flex-1 px-3.5 pt-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="truncate font-sans text-[11.5px] text-ink-subtle">
            {label}
          </span>
          <span className="ml-auto flex-none">
            {delta ? <DeltaPill delta={delta} /> : null}
          </span>
        </div>
        <div className="flex flex-col items-start">
          <ChartStatFlow
            value={shownValue}
            label={shownSub}
            valueClassName="font-sans text-[26px] leading-none font-semibold tracking-[-0.9px] text-ink"
            labelClassName="mt-1.5 font-mono text-[10.5px] text-ink-tertiary"
          />
        </div>
      </div>
      {spark ? (
        <AreaChart
          data={spark}
          xDataKey="date"
          aspectRatio="auto"
          style={{ height: 40 }}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          animationDuration={0}
          className="mt-2.5"
        >
          <StatCardHoverBridge dataKey="v" onHoverChange={setHover} />
          <Area
            dataKey="v"
            stroke={TEAL.bright}
            strokeWidth={1.5}
            fill={TEAL.base}
            fillOpacity={0.34}
            gradientToOpacity={0}
            fadeEdges={false}
          />
        </AreaChart>
      ) : (
        <div className="mt-2.5 flex h-10 items-center px-3.5">
          <div className="h-px w-full bg-hairline" />
        </div>
      )}
    </div>
  );
}

function DeltaPill({ delta }: { delta: Delta }) {
  const color = delta.neutral
    ? "var(--color-ink-tertiary)"
    : delta.good
      ? "var(--color-success)"
      : "var(--color-label-red)";
  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded-full px-2 font-mono text-[10.5px] whitespace-nowrap"
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

/** Track + fill bar for the ranked lists. `ratio` is 0–1. */
function Bar({ ratio, fill }: { ratio: number; fill: string }) {
  return (
    <span className="h-[7px] flex-[1_0_60px] overflow-hidden rounded-full bg-surface-3">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: fill }}
      />
    </span>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center">
      <span className="font-mono text-[12px] text-ink-tertiary">
        No mailbox data in scope.
      </span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className="font-mono text-[12px] text-label-red">
        Couldn’t load analytics.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-hairline bg-surface-1 px-3 py-1.5 font-mono text-[11.5px] text-ink-subtle hover:text-ink"
      >
        Retry
      </button>
    </div>
  );
}
