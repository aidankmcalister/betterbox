import { useEffect, useSyncExternalStore } from "react";
import type { Density } from "@/components/thread-row";

export type AccentId =
  | "orange"
  | "blue"
  | "teal"
  | "purple"
  | "green"
  | "yellow";
export type SnippetFont = "sans" | "mono";
export type ExportFormat = "md" | "json" | "txt";
export type Clock = "12h" | "24h";
export type MarkRead = "off" | "instant" | "1s" | "5s";
export type ReaderMode = "shared" | "split";

export type Settings = {
  density: Density;
  showSnippets: boolean;
  snippetFont: SnippetFont;
  accent: AccentId;
  /** accountId → index into ACCOUNT_COLORS; unset accounts fall back to their position in the accounts list. */
  accountColors: Record<string, number>;
  /** Gmail label id → index into the tag color palette; client-side only (label name still derives a default color). */
  tagColors: Record<string, number>;
  showTechnicalMetadata: boolean;
  exportFormat: ExportFormat;
  clock: Clock;
  markRead: MarkRead;
  readerMode: ReaderMode;
  /** Off by default — the account dot already carries the account color. */
  inboxAvatars: boolean;
  /** Inbox can never be hidden. */
  hiddenNav: string[];
  devTools: boolean;
  /** Hides real accounts and runs on demo data — for recording videos without exposing real mail. */
  demoMode: boolean;
};

const STORAGE_KEY = "bm.settings";
const DEFAULT_SETTINGS: Settings = {
  density: "compact",
  showSnippets: true,
  snippetFont: "sans",
  accent: "orange",
  accountColors: {},
  tagColors: {},
  showTechnicalMetadata: true,
  exportFormat: "md",
  clock: "12h",
  markRead: "1s",
  readerMode: "shared",
  inboxAvatars: false,
  hiddenNav: [],
  devTools: false,
  demoMode: false,
};

export const MARK_READ_MS: Record<MarkRead, number | null> = {
  off: null,
  instant: 0,
  "1s": 1000,
  "5s": 5000,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

function snapshot(): Settings {
  if (current === null) current = load();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SETTINGS);
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...snapshot(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // storage unavailable — settings just won't persist
  }
  listeners.forEach((listener) => listener());
}

export function setAccountColor(accountId: string, colorIndex: number) {
  updateSettings({
    accountColors: { ...snapshot().accountColors, [accountId]: colorIndex },
  });
}

export function setTagColor(labelId: string, colorIndex: number) {
  updateSettings({
    tagColors: { ...snapshot().tagColors, [labelId]: colorIndex },
  });
}

export const ACCENTS: Record<
  AccentId,
  { label: string; base: string; hover: string; focus: string }
> = {
  orange: {
    label: "Orange",
    base: "#f46a3c",
    hover: "#ff885f",
    focus: "#db5a2e",
  },
  blue: { label: "Blue", base: "#4ea7fc", hover: "#7cbdfd", focus: "#2e8de4" },
  teal: { label: "Teal", base: "#1fb8a6", hover: "#38d6c2", focus: "#169486" },
  purple: {
    label: "Purple",
    base: "#b59aff",
    hover: "#cbbaff",
    focus: "#9878f2",
  },
  green: {
    label: "Green",
    base: "#4cb782",
    hover: "#6fcb9d",
    focus: "#379a68",
  },
  yellow: {
    label: "Yellow",
    base: "#f2c94c",
    hover: "#f6d97a",
    focus: "#d9ad26",
  },
};

const ACCENT_VARS = [
  "--primary",
  "--primary-hover",
  "--primary-focus",
  "--ring",
  "--sidebar-primary",
  "--sidebar-ring",
] as const;

export function useApplyAccent() {
  const { accent } = useSettings();
  useEffect(() => {
    const style = document.documentElement.style;
    if (accent === "orange") {
      ACCENT_VARS.forEach((name) => style.removeProperty(name));
      return;
    }
    const { base, hover, focus } = ACCENTS[accent];
    style.setProperty("--primary", base);
    style.setProperty("--primary-hover", hover);
    style.setProperty("--primary-focus", focus);
    style.setProperty("--ring", focus);
    style.setProperty("--sidebar-primary", base);
    style.setProperty("--sidebar-ring", focus);
  }, [accent]);
}
