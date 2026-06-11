import type { Account } from "@/lib/account";
import type { ScopedAnalytics } from "@/lib/analytics-types";

/**
 * Pure transforms behind the Analytics page. No React, no chart imports — just
 * the per-account day series + top senders coming off `/api/analytics`, folded
 * into the shape the view renders. Kept separate so it stays easy to reason
 * about (and test) without a DOM.
 */

/** One account's daily received/sent counts, aligned to the canonical axis. */
export type SeriesAccount = {
  accountId: string;
  email: string;
  received: number[];
  sent: number[];
  totalReceived: number;
};

export type TopSenderRow = {
  name: string;
  email: string;
  count: number;
  /** Account whose dot colors the row (the one that received the most). */
  accountId: string;
};

export type AnalyticsModel = {
  /** ISO `YYYY-MM-DD`, oldest → newest. The shared x-axis for every series. */
  dates: string[];
  /** One entry per account with data, busiest first. */
  series: SeriesAccount[];
  totalReceived: number[];
  totalSent: number[];
  topSenders: TopSenderRow[];
  /** Largest sender count, floored at 1 so bar widths never divide by zero. */
  maxSender: number;
};

/** Delta pill state for a KPI: the formatted label plus good/neutral flags. */
export type Delta = { label: string; good: boolean; neutral: boolean };

/** Align every account's day series to one canonical date axis, sum the totals,
 *  and merge top senders across accounts (busiest account owns the dot). */
export function buildAnalyticsModel(
  results: ScopedAnalytics[],
  accounts: Account[],
): AnalyticsModel {
  const emailOf = new Map(accounts.map((a) => [a.accountId, a.email]));
  const withData = results.filter((r) => r.analytics.days.length > 0);
  // Pick the longest series as the canonical axis; all real accounts share the
  // same range, but this stays correct if one comes back short.
  const base = withData.reduce<ScopedAnalytics | null>(
    (longest, r) =>
      !longest || r.analytics.days.length > longest.analytics.days.length
        ? r
        : longest,
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

  return {
    dates,
    series,
    totalReceived,
    totalSent,
    ...mergeTopSenders(withData),
  };
}

/** Tally each sender across all accounts; the account contributing the most to
 *  a given sender owns its colored dot. Returns the top 6 + the max count. */
function mergeTopSenders(withData: ScopedAnalytics[]): {
  topSenders: TopSenderRow[];
  maxSender: number;
} {
  type Tally = {
    name: string;
    email: string;
    count: number;
    byAccount: Map<string, number>;
  };
  const merged = new Map<string, Tally>();
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
  return { topSenders, maxSender };
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

/** A `{ date, v }` series for a flush KPI sparkline, sliced to the range. */
export function sliceSeries(dates: string[], values: number[], from: number) {
  return dates.slice(from).map((date, i) => ({ date, v: values[from + i] ?? 0 }));
}

/** Percent change today-vs-yesterday, formatted for a delta pill. */
export function pctDelta(today: number, prev: number): Delta {
  if (prev === 0) {
    return {
      label: today > 0 ? "new" : "0%",
      good: today > 0,
      neutral: today === 0,
    };
  }
  const pct = Math.round(((today - prev) / prev) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return { label: `${sign}${Math.abs(pct)}%`, good: pct >= 0, neutral: pct === 0 };
}
