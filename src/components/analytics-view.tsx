import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import type { Account } from "@/lib/account";
import { useAccountColor } from "@/components/account-dot";
import { useAnalyticsQuery, type ScopedAnalytics } from "@/lib/mail-queries";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip, type TooltipRow } from "@/components/charts/tooltip";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";

/* Color contract (analytics-spec): charts speak the dev-only teal ramp. Account
   identity lives only in the 6px dots — never as a chart series color. */
const TEAL = { bright: "#3edbc8", base: "#1fb8a6", deep: "#0f7c6f", focus: "#169486" };
const SERIES_RAMP = [TEAL.bright, TEAL.deep, TEAL.base, TEAL.focus];
const GRID_STROKE = "color-mix(in srgb, #8a8f98 16%, transparent)";

type Range = "7d" | "14d" | "30d";
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "14d": 14, "30d": 30 };

/** Series color for the account at volume-rank `idx` (0 = busiest = bright). */
function seriesColor(idx: number) {
  if (idx === 0) return { line: TEAL.bright, fill: TEAL.base };
  const c = SERIES_RAMP[idx % SERIES_RAMP.length];
  return { line: c, fill: c };
}

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

  const model = useMemo(() => buildModel(results, accounts), [results, accounts]);
  const days = RANGE_DAYS[range];
  const sliceFrom = Math.max(0, model.dates.length - days);
  const visibleDays = model.dates.length - sliceFrom;

  const status = query.isLoading ? "loading" : "ready";

  // ── KPI values (today vs yesterday, off the full series) ────────────────────
  const last = model.dates.length - 1;
  const receivedToday = model.totalReceived[last] ?? 0;
  const sentToday = model.totalSent[last] ?? 0;
  const receivedDelta = pctDelta(receivedToday, model.totalReceived[last - 1] ?? 0);
  const sentDelta = pctDelta(sentToday, model.totalSent[last - 1] ?? 0);

  const receivedSpark = sliceSeries(model.dates, model.totalReceived, sliceFrom);
  const sentSpark = sliceSeries(model.dates, model.totalSent, sliceFrom);

  // ── hero: one gradient-area series per scoped account ──────────────────────
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
  // Draw busiest last so its bright fill sits on top of the deeper ones.
  const drawOrder = model.series.map((_, idx) => idx).reverse();

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
        ) : model.series.length === 0 && status === "ready" ? (
          <EmptyState />
        ) : (
          <>
            {/* KPI strip */}
            <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(185px,1fr))] gap-3">
              <KpiCard
                label="Received"
                value={receivedToday.toLocaleString()}
                sub="today · all accounts"
                delta={receivedDelta}
                spark={receivedSpark}
                status={status}
              />
              <KpiCard
                label="Sent"
                value={sentToday.toLocaleString()}
                sub="today · all accounts"
                delta={sentDelta}
                spark={sentSpark}
                status={status}
              />
              <KpiCard
                label="Median first reply"
                value="—"
                sub="not tracked yet"
                absent
              />
              <KpiCard
                label="API units"
                value="—"
                sub="of 1M daily quota"
                absent
              />
            </div>

            {/* hero — message volume */}
            <Card
              title="Message volume"
              caption={`received · last ${visibleDays} days`}
              className="mb-3.5"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                {model.series.map((s, idx) => (
                  <span
                    key={s.accountId}
                    className="inline-flex items-center gap-1.5 font-sans text-[11.5px] text-ink-subtle"
                  >
                    <Swatch color={seriesColor(idx).line} />
                    {s.email}
                  </span>
                ))}
              </div>
              <AreaChart
                data={heroData}
                xDataKey="date"
                aspectRatio="auto"
                style={{ height: 240 }}
                margin={{ top: 8, right: 10, bottom: 28, left: 10 }}
                status={status}
              >
                <Grid numTicksRows={5} stroke={GRID_STROKE} strokeDasharray="3 5" />
                {drawOrder.map((idx) => {
                  const c = seriesColor(idx);
                  return (
                    <Area
                      key={idx}
                      dataKey={`a${idx}`}
                      stroke={c.line}
                      strokeWidth={1.75}
                      fill={c.fill}
                      fillOpacity={0.3}
                      gradientToOpacity={0.02}
                      fadeEdges={false}
                    />
                  );
                })}
                <XAxis numTicks={5} />
                <ChartTooltip
                  indicatorColor="rgba(247,248,248,0.28)"
                  indicatorDasharray="3 4"
                  rows={(point) => heroRows(point, model.series)}
                />
              </AreaChart>
            </Card>

            {/* bottom row */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-3.5">
              <Card title="Top senders" caption="30d">
                {model.topSenders.length === 0 ? (
                  <AbsentPlot label="no inbox sample yet" height={150} />
                ) : (
                  <div className="flex flex-col gap-3 pt-0.5">
                    {model.topSenders.map((s, i) => (
                      <div key={s.email} className="flex items-center gap-2.5">
                        <span className="w-[13px] flex-none font-mono text-[10.5px] text-ink-tertiary">
                          {i + 1}
                        </span>
                        <SenderDot
                          accountId={s.accountId}
                          fallbackIndex={accountIndex.get(s.accountId) ?? 0}
                        />
                        <span
                          title={s.email}
                          className="min-w-[56px] flex-[0_1_92px] truncate font-sans text-[12.5px] text-ink-muted"
                        >
                          {s.name}
                        </span>
                        <span className="h-[7px] flex-[1_0_60px] overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(s.count / model.maxSender) * 100}%`,
                              background: `linear-gradient(90deg, ${TEAL.deep}, ${TEAL.bright})`,
                            }}
                          />
                        </span>
                        <span className="w-9 flex-none text-right font-mono text-[11.5px] text-ink">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="API units used" caption="units / day · ×1k">
                <AbsentPlot label="no request ledger yet" height={130} />
              </Card>

              <Card title="Webhook success" caption="30d">
                <div className="mx-auto" style={{ width: 172, height: 172 }}>
                  <RingChart
                    data={[{ label: "Delivered", value: 0, maxValue: 100 }]}
                    strokeWidth={6}
                    startAngle={-0.75 * Math.PI}
                    endAngle={0.75 * Math.PI}
                    className="size-full"
                  >
                    <Ring index={0} color={TEAL.bright} lineCap="round" />
                    <RingCenter>
                      {() => (
                        <div className="flex flex-col items-center gap-[3px]">
                          <span className="font-sans text-[27px] font-semibold tracking-[-1px] text-ink">
                            —
                          </span>
                          <span className="font-mono text-[10px] text-ink-tertiary">
                            no deliveries yet
                          </span>
                        </div>
                      )}
                    </RingCenter>
                  </RingChart>
                </div>
                <div className="mt-2.5 text-center font-mono text-[10.5px] text-ink-tertiary">
                  webhooks not configured
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── data model ───────────────────────────────────────────────────────────────

type SeriesAccount = {
  accountId: string;
  email: string;
  received: number[];
  sent: number[];
  totalReceived: number;
};

type TopSenderRow = {
  name: string;
  email: string;
  count: number;
  accountId: string;
};

type Model = {
  dates: string[];
  series: SeriesAccount[];
  totalReceived: number[];
  totalSent: number[];
  topSenders: TopSenderRow[];
  maxSender: number;
};

/** Align every account's day series to one canonical date axis, sum the totals,
 *  and merge top senders across accounts (busiest account owns the dot). */
function buildModel(results: ScopedAnalytics[], accounts: Account[]): Model {
  const emailOf = new Map(accounts.map((a) => [a.accountId, a.email]));
  const withData = results.filter((r) => r.analytics.days.length > 0);
  const base = withData.reduce<ScopedAnalytics | null>(
    (a, b) => (!a || b.analytics.days.length > a.analytics.days.length ? b : a),
    null,
  );
  const dates = base ? base.analytics.days.map((d) => d.date) : [];

  const series: SeriesAccount[] = withData
    .map((r) => {
      const received = new Map(r.analytics.days.map((d) => [d.date, d.received]));
      const sent = new Map(r.analytics.days.map((d) => [d.date, d.sent]));
      const recv = dates.map((dt) => received.get(dt) ?? 0);
      return {
        accountId: r.accountId,
        email: emailOf.get(r.accountId) ?? r.accountId,
        received: recv,
        sent: dates.map((dt) => sent.get(dt) ?? 0),
        totalReceived: recv.reduce((sum, n) => sum + n, 0),
      };
    })
    .sort((a, b) => b.totalReceived - a.totalReceived);

  const totalReceived = dates.map((_, i) =>
    series.reduce((sum, s) => sum + (s.received[i] ?? 0), 0),
  );
  const totalSent = dates.map((_, i) =>
    series.reduce((sum, s) => sum + (s.sent[i] ?? 0), 0),
  );

  // Merge senders across accounts; the account contributing the most to a
  // sender owns the colored dot.
  const merged = new Map<
    string,
    { name: string; email: string; count: number; byAccount: Map<string, number> }
  >();
  for (const r of withData) {
    for (const s of r.analytics.topSenders) {
      const key = s.email.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.count += s.count;
        existing.byAccount.set(
          r.accountId,
          (existing.byAccount.get(r.accountId) ?? 0) + s.count,
        );
      } else {
        merged.set(key, {
          name: s.name,
          email: s.email,
          count: s.count,
          byAccount: new Map([[r.accountId, s.count]]),
        });
      }
    }
  }
  const topSenders: TopSenderRow[] = [...merged.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((s) => ({
      name: s.name,
      email: s.email,
      count: s.count,
      accountId: dominantAccount(s.byAccount),
    }));
  const maxSender = Math.max(1, ...topSenders.map((s) => s.count));

  return { dates, series, totalReceived, totalSent, topSenders, maxSender };
}

function dominantAccount(byAccount: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [id, count] of byAccount) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function sliceSeries(dates: string[], values: number[], from: number) {
  return dates.slice(from).map((date, i) => ({ date, v: values[from + i] ?? 0 }));
}

function heroRows(
  point: Record<string, unknown>,
  series: SeriesAccount[],
): TooltipRow[] {
  const rows: TooltipRow[] = series.map((s, idx) => ({
    color: seriesColor(idx).line,
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

type Delta = { label: string; good: boolean; neutral: boolean };

function pctDelta(today: number, prev: number): Delta {
  if (prev === 0) {
    return { label: today > 0 ? "new" : "0%", good: today > 0, neutral: today === 0 };
  }
  const pct = Math.round(((today - prev) / prev) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return { label: `${sign}${Math.abs(pct)}%`, good: pct >= 0, neutral: pct === 0 };
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

function KpiCard({
  label,
  value,
  sub,
  delta,
  spark,
  status,
  absent = false,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: Delta;
  spark?: { date: string; v: number }[];
  status?: "loading" | "ready";
  absent?: boolean;
}) {
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
        <div className="font-sans text-[26px] leading-none font-semibold tracking-[-0.9px] text-ink">
          {value}
        </div>
        <div className="mt-1.5 font-mono text-[10.5px] text-ink-tertiary">
          {sub}
        </div>
      </div>
      {absent || !spark ? (
        <div className="mt-2.5 flex h-[34px] items-center px-3.5">
          <div className="h-px w-full bg-hairline" />
        </div>
      ) : (
        <AreaChart
          data={spark}
          xDataKey="date"
          aspectRatio="auto"
          style={{ height: 34 }}
          margin={{ top: 3, right: 0, bottom: 0, left: 0 }}
          status={status}
          className="mt-2.5"
        >
          <Area
            dataKey="v"
            stroke={TEAL.bright}
            strokeWidth={1.5}
            fill={TEAL.base}
            fillOpacity={0.34}
            gradientToOpacity={0}
            fadeEdges={false}
            showHighlight={false}
          />
        </AreaChart>
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

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-[3px] w-2.5 flex-none rounded-sm"
      style={{ background: color }}
    />
  );
}

function SenderDot({
  accountId,
  fallbackIndex,
}: {
  accountId: string;
  fallbackIndex: number;
}) {
  const color = useAccountColor(fallbackIndex, accountId);
  return (
    <span
      className="size-1.5 flex-none rounded-full"
      style={{ background: color }}
    />
  );
}

/** Dim placeholder for a metric with no data source yet (real-or-absent). */
function AbsentPlot({ label, height }: { label: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-hairline"
      style={{ height }}
    >
      <span className="font-mono text-[10.5px] text-ink-tertiary">{label}</span>
    </div>
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
