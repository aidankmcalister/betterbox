import { useEffect, useSyncExternalStore } from "react";
import type { Density } from "@/components/thread-row";

export type AccentId =
  | "orange"
  | "blue"
  | "teal"
  | "purple"
  | "green"
  | "yellow";
export type PreviewFont = "sans" | "mono";
export type ExportFormat = "md" | "json" | "txt";
export type Clock = "12h" | "24h";
export type MarkRead = "off" | "instant" | "1s" | "5s";
export type ReaderMode = "shared" | "split";
export type ComposerMode = "popout" | "pane";

export type Settings = {
  density: Density;
  /** The gray body-text preview line in each message-list row. */
  showPreview: boolean;
  previewFont: PreviewFont;
  accent: AccentId;
  /** accountId → ACCOUNT_COLORS index; unset accounts fall back to list position. */
  accountColors: Record<string, number>;
  /** Gmail label id → tag palette index; client-side only (label name still derives a default). */
  tagColors: Record<string, number>;
  /** Open messages in raw MIME view by default instead of the rendered body. */
  rawByDefault: boolean;
  exportFormat: ExportFormat;
  clock: Clock;
  markRead: MarkRead;
  readerMode: ReaderMode;
  /** Popout = floating bottom-right panel; pane = a draggable tile in the board. */
  composerMode: ComposerMode;
  /** accountId the composer should default its From to; null = primary inbox. */
  defaultSendFrom: string | null;
  /** Off by default — the account dot already carries the account color. */
  inboxAvatars: boolean;
  /** Inbox can never be hidden. */
  hiddenNav: string[];
  devTools: boolean;
  /** Hides real accounts, runs on demo data — for recording without exposing real mail. */
  demoMode: boolean;
};

const STORAGE_KEY = "bm.settings";
const DEFAULT_SETTINGS: Settings = {
  density: "compact",
  showPreview: true,
  previewFont: "sans",
  accent: "orange",
  accountColors: {},
  tagColors: {},
  rawByDefault: false,
  exportFormat: "md",
  clock: "12h",
  markRead: "1s",
  readerMode: "shared",
  composerMode: "popout",
  defaultSendFrom: null,
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
    const parsed = JSON.parse(raw) as Partial<Settings> & {
      showSnippets?: boolean;
      snippetFont?: PreviewFont;
    };
    // Migrate renamed preview keys (showSnippets/snippetFont → showPreview/
    // previewFont) so existing local settings carry over.
    if (parsed.showSnippets !== undefined && parsed.showPreview === undefined) {
      parsed.showPreview = parsed.showSnippets;
    }
    if (parsed.snippetFont !== undefined && parsed.previewFont === undefined) {
      parsed.previewFont = parsed.snippetFont;
    }
    delete parsed.showSnippets;
    delete parsed.snippetFont;
    return { ...DEFAULT_SETTINGS, ...parsed };
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
  listeners.forEach((listener) => {
    listener();
  });
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
      ACCENT_VARS.forEach((name) => {
        style.removeProperty(name);
      });
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
