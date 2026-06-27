import { createFileRoute } from "@tanstack/react-router";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Stream remote email images through our origin (like Gmail's image proxy):
 * bypasses tracker blockers on sender CDNs (e.g. LinkedIn's licdn.com) and
 * keeps the reader's IP/referer out of tracking pixels.
 *
 * SSRF hardening — the URL is attacker-controlled (an email's auto-loaded <img
 * src>): resolve the host and reject private/internal/metadata IPs, https only,
 * re-validate every redirect hop, and cap response time and size.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — generous for an email image.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;

/** True for loopback / private / link-local / ULA / metadata / multicast IPs. */
function isPrivateIp(raw: string): boolean {
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254) to its IPv4 form.
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const ip = mapped ? mapped[1] : raw;

  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || // "this" network
      a === 127 || // loopback
      a === 10 || // RFC 1918
      (a === 172 && b >= 16 && b <= 31) || // RFC 1918
      (a === 192 && b === 168) || // RFC 1918
      (a === 169 && b === 254) || // link-local incl. cloud metadata
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      a >= 224 // multicast / reserved
    );
  }

  // IPv6.
  const ip6 = ip.toLowerCase();
  return (
    ip6 === "::" ||
    ip6 === "::1" || // unspecified / loopback
    ip6.startsWith("fe80") || // link-local
    ip6.startsWith("fc") ||
    ip6.startsWith("fd") || // unique-local fc00::/7
    ip6.startsWith("ff") // multicast
  );
}

/** True if the host is a literal private IP, fails to resolve, or resolves to
 *  ANY private address. Lookup failure fails closed, deliberately. */
async function resolvesToPrivate(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (isIP(host)) return isPrivateIp(host);
  try {
    const records = await lookup(host, { all: true });
    return records.length === 0 || records.some((r) => isPrivateIp(r.address));
  } catch {
    return true;
  }
}

/** A fetchable, public https URL — or null if it should be refused. */
async function safeTarget(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Upgrade http to https rather than reject: marketing emails (e.g. SendGrid)
  // ship http <img> srcs that serve the same asset over https. SSRF is stopped
  // by the private-IP guard below, not the scheme.
  if (url.protocol === "http:") {
    url.protocol = "https:";
    if (url.port === "80") url.port = "";
  }
  if (url.protocol !== "https:") return null;
  if (await resolvesToPrivate(url.hostname)) return null;
  return url;
}

const BROWSERISH_HEADERS = {
  accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

export const Route = createFileRoute("/api/image-proxy")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // No session gate: the reader's sandboxed srcdoc iframe doesn't
        // reliably send the session cookie, so requiring auth broke every
        // proxied image. The route is already SSRF-hardened; to avoid being an
        // open relay we drop only blatant cross-site requests (same-origin
        // iframe loads are unaffected).
        if (request.headers.get("sec-fetch-site") === "cross-site") {
          return new Response("Forbidden", { status: 403 });
        }

        const raw = new URL(request.url).searchParams.get("url") ?? "";
        let target = await safeTarget(raw);
        if (!target) return new Response("Invalid url", { status: 400 });

        // Follow redirects ourselves so each hop is re-validated against the
        // private-IP guard (a public host can 30x to an internal one).
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let upstream: Response;
        try {
          for (let hop = 0; ; hop++) {
            upstream = await fetch(target, {
              headers: BROWSERISH_HEADERS,
              redirect: "manual",
              signal: controller.signal,
            });
            const location = upstream.headers.get("location");
            const isRedirect = upstream.status >= 300 && upstream.status < 400;
            if (!isRedirect || !location) break;
            if (hop >= MAX_REDIRECTS) {
              return new Response("Too many redirects", { status: 502 });
            }
            const next = await safeTarget(new URL(location, target).href);
            if (!next) return new Response("Invalid url", { status: 400 });
            target = next;
          }
        } catch {
          return new Response("Upstream fetch failed", { status: 502 });
        } finally {
          clearTimeout(timer);
        }

        if (!upstream.ok || !upstream.body) {
          return new Response("Upstream error", { status: 502 });
        }

        // Reject oversized responses up front when the size is advertised.
        const declared = Number(upstream.headers.get("content-length"));
        if (declared && declared > MAX_BYTES) {
          return new Response("Too large", { status: 502 });
        }

        const type = upstream.headers.get("content-type") ?? "";
        // Some CDNs mislabel images as octet-stream; allow those through too.
        if (!type.startsWith("image/") && type !== "application/octet-stream") {
          return new Response("Not an image", { status: 415 });
        }

        return new Response(capBytes(upstream.body, MAX_BYTES), {
          headers: {
            "content-type": type,
            "cache-control": "private, max-age=86400",
          },
        });
      },
    },
  },
});

/** Pass a stream through, erroring past `max` bytes (guards a CDN that omits
 *  content-length and streams unbounded data). */
function capBytes(
  body: ReadableStream<Uint8Array>,
  max: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        controller.error(new Error("Response too large"));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {});
    },
  });
}
