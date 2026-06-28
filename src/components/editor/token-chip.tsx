import {
  CalendarIcon,
  MailIcon,
  Pencil,
  TextCursorIcon,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";

type ChipTone = "auto" | "fill" | "cursor";

const PERSON = new Set(["first_name", "last_name", "name"]);

/** Auto-filled recipient variables are blue, manual fill-ins orange, the cursor
 *  marker gray. One rule, used by both the fill-field and date chips. */
export function tokenTone(key: string): ChipTone {
  const k = key.toLowerCase();
  if (k === "cursor") return "cursor";
  return VARIABLE_KEYS.has(k) ? "auto" : "fill";
}

export function tokenIcon(key: string): LucideIcon {
  const k = key.toLowerCase();
  if (k === "cursor") return TextCursorIcon;
  if (k === "date") return CalendarIcon;
  if (k === "email") return MailIcon;
  if (PERSON.has(k)) return UserRound;
  return Pencil;
}

const TONE_CLASS: Record<ChipTone, string> = {
  auto: "border-label-blue/45 bg-label-blue/12 text-label-blue hover:bg-label-blue/20",
  fill: "border-primary/45 bg-primary/12 text-primary hover:bg-primary/20",
  cursor:
    "border-muted-foreground/45 bg-muted-foreground/12 text-muted-foreground hover:bg-muted-foreground/20",
};

const BASE =
  "relative mx-px inline-flex cursor-pointer items-center gap-0.5 rounded-[5px] border px-[0.4em] py-[0.02em] align-[-0.15em] text-[0.9em] leading-[1.45] whitespace-nowrap font-[inherit] transition-colors [&>svg]:size-[0.95em] [&>svg]:shrink-0";

/** Shared chip styling for every token chip — snippet editor and composer. */
export function tokenChipClass(key: string, selected?: boolean): string {
  return cn(BASE, TONE_CLASS[tokenTone(key)], selected && "ring-2 ring-foreground/35");
}
