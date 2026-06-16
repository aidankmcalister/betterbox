import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** A few common two-level public suffixes so we don't strip "co.uk" → "uk". */
const TWO_LEVEL_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "co.nz",
  "co.jp",
  "co.za",
  "com.br",
  "co.in",
]);

// Subdomains return generic-globe favicons; strip to root domain for the real brand mark.
function rootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  const lastTwo = parts.slice(-2).join(".");
  return TWO_LEVEL_TLDS.has(lastTwo)
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
}

// DuckDuckGo first — returns the real favicon more often; Google falls back to a generic globe.
export function SenderAvatar({
  name,
  address,
  color,
  className,
}: {
  name: string;
  address: string;
  color: string;
  className?: string;
}) {
  const domain = address.trim().toLowerCase().split("@")[1];
  const root = domain ? rootDomain(domain) : null;
  const sources = root
    ? [
        `https://icons.duckduckgo.com/ip3/${root}.ico`,
        `https://www.google.com/s2/favicons?domain=${root}&sz=128`,
      ]
    : [];

  const [index, setIndex] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the favicon-source fallback index only when the resolved domain changes.
  useEffect(() => setIndex(0), [root]);
  const src = sources[index];

  if (src) {
    return (
      <img
        key={src}
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setIndex((current) => current + 1)}
        // White plate so transparent-background favicons (e.g. black logos) stay visible in dark mode.
        className={cn(
          "size-9 shrink-0 rounded-full border border-input bg-white object-contain",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-input text-[13px] font-semibold text-foreground",
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${color} 22%, var(--background))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
