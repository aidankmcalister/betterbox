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

/**
 * Sender avatar derived from the email: the sender domain's favicon, then
 * colored initials. We load the favicon DIRECTLY in the browser first — it's
 * fast, reliable, and renders even when the server-side image proxy can't reach
 * the upstream (VPN/dev fetch, rate limits). The proxied copy is only a fallback
 * for when a tracker blocker kills the direct request.
 */
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
  const favicon = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    : null;
  const sources = favicon
    ? [favicon, `/api/image-proxy?url=${encodeURIComponent(favicon)}`]
    : [];

  // Walk the sources on error; once we run out, render initials.
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [domain]);
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
        className={cn(
          "size-9 shrink-0 rounded-full border border-input bg-muted object-cover",
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
      style={{ background: `color-mix(in srgb, ${color} 22%, var(--background))` }}
    >
      {initials(name)}
    </span>
  );
}
