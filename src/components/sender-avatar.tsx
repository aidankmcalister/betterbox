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

// Only show a favicon when it's a real, sharp brand mark — otherwise colored
// initials. Google's service hands back a tiny (~16px) generic globe when a
// domain has no favicon, even at sz=128, and it returns 200 (not an error) so
// onError can't catch it. We preload and measure the natural width instead:
// anything below this is either the generic globe or too low-res to look good,
// so it falls back to initials.
const MIN_FAVICON_PX = 32;

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
  const src = root
    ? `https://www.google.com/s2/favicons?domain=${root}&sz=128`
    : null;

  // Resolve to a usable favicon only after it loads big enough; until then
  // (and forever, for generic/missing favicons) we render the initials, so the
  // globe never flashes. The image is cached by this preload, so swapping it in
  // is instant.
  const [favicon, setFavicon] = useState<string | null>(null);
  useEffect(() => {
    setFavicon(null);
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (!cancelled && img.naturalWidth >= MIN_FAVICON_PX) setFavicon(src);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (favicon) {
    return (
      <img
        src={favicon}
        alt=""
        // White plate keeps transparent dark logos visible in dark mode; the
        // mark fills the circle so there's no stray plate showing as a ring.
        className={cn(
          "size-9 shrink-0 rounded-full bg-white object-cover",
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
