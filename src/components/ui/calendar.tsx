import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Minimal single-month date picker, themed to the app. Selecting a day calls
 *  onSelect with that Date. */
export function Calendar({
  selected,
  onSelect,
}: {
  selected?: Date;
  onSelect: (date: Date) => void;
}) {
  const today = new Date();
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const navBtn =
    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4";

  return (
    <div className="w-[244px] select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          className={navBtn}
          onClick={() => setView(new Date(year, month - 1, 1))}
        >
          <ChevronLeftIcon />
        </button>
        <span className="text-[13px] font-medium text-foreground">
          {monthLabel}
        </span>
        <button
          type="button"
          aria-label="Next month"
          className={navBtn}
          onClick={() => setView(new Date(year, month + 1, 1))}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday header.
            key={i}
            className="flex h-6 items-center justify-center text-[10.5px] font-medium text-muted-foreground/60"
          >
            {w}
          </div>
        ))}
        {cells.map((date, i) =>
          date ? (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-[12.5px] text-foreground/90 transition-colors hover:bg-muted",
                selected &&
                  sameDay(date, selected) &&
                  "bg-primary text-primary-foreground hover:bg-primary",
                sameDay(date, today) &&
                  !(selected && sameDay(date, selected)) &&
                  "font-semibold text-foreground ring-1 ring-inset ring-border",
              )}
            >
              {date.getDate()}
            </button>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: blank leading cell.
            <div key={`pad-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
