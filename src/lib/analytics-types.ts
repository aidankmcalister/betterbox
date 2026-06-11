/**
 * Wire types for `/api/analytics` — the single source of truth shared by the
 * server producer (`gmail/api.server`) and the client consumer (`mail-queries`)
 * so the two can never drift. Pure types, zero runtime deps.
 */

/** One day's counts for a single account. `date` is ISO `YYYY-MM-DD`. */
export type AnalyticsDay = { date: string; received: number; sent: number };

export type TopSender = { name: string; email: string; count: number };

export type AccountAnalytics = { days: AnalyticsDay[]; topSenders: TopSender[] };

/** One account's analytics as the page consumes it (id + payload). */
export type ScopedAnalytics = { accountId: string; analytics: AccountAnalytics };
