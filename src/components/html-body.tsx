import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";

// DOMPurify needs a real DOM; no-op during SSR.
// Privacy: remote subresources that would leak the reader's IP/User-Agent to the
// sender's host are proxied (<img> src, inline-style url() backgrounds — fetched
// server-side so the sender only sees our IP) or stripped (<link> stylesheets,
// @font-face, @import, <video>/<audio>/<object>/<embed>). Remote fonts are a
// tracking vector, so @font-face stays stripped even though it's "just CSS".

/** Strip remote fetches from a <style> block: @import and http(s)/protocol-relative
 *  url() values (kills @font-face + remote background CSS). data:/cid: left intact. */
function stripRemoteCss(css: string): string {
  return css
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:https?:|\/\/)[^)]*\1\s*\)/gi, "url()");
}

/** Proxy remote url() values in an inline style attribute so background-image
 *  (and `background` shorthand) render without leaking the reader's IP. */
function proxyCssUrls(css: string): string {
  if (typeof window === "undefined") return css;
  return css.replace(
    /url\(\s*(['"]?)\s*((?:https?:\/\/|\/\/)[^)'"\s]+)\s*\1\s*\)/gi,
    (_match, quote: string, url: string) => {
      const abs = url.startsWith("//") ? `https:${url}` : url;
      return `url(${quote}${window.location.origin}/api/image-proxy?url=${encodeURIComponent(abs)}${quote})`;
    },
  );
}

let hookRegistered = false;
function sanitizeEmail(html: string): string {
  if (typeof window === "undefined") return "";
  if (!hookRegistered) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "IMG") {
        node.removeAttribute("srcset");
        const src = node.getAttribute("src");
        // Proxy absolute http(s) + protocol-relative srcs. cid: (inline attachment)
        // srcs left for the parent to resolve in onLoad (has message id/account).
        if (src && /^(https?:)?\/\//i.test(src)) {
          const abs = src.startsWith("//") ? `https:${src}` : src;
          // Absolute origin, not root-relative: in the srcdoc iframe "/api/…"
          // resolves against about:srcdoc, not the app, and 404s.
          node.setAttribute(
            "src",
            `${window.location.origin}/api/image-proxy?url=${encodeURIComponent(abs)}`,
          );
        }
      }
      // Any link that leaves the message opens in a new tab.
      if (node.tagName === "A" && node.getAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      // <style> remote CSS stripped — neutralizes @font-face + remote background CSS.
      if (node.tagName === "STYLE" && node.textContent) {
        node.textContent = stripRemoteCss(node.textContent);
      }
      // Inline styles instead get remote url() proxied so background images render.
      const inlineStyle =
        node.nodeType === 1 ? (node as Element).getAttribute("style") : null;
      if (inlineStyle) {
        (node as Element).setAttribute("style", proxyCssUrls(inlineStyle));
      }
    });
    hookRegistered = true;
  }
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    // Inline <style> kept (scrubbed above); From/layout styling lives there.
    ADD_TAGS: ["style"],
    ADD_ATTR: ["target"],
    // Tags/attrs that fetch remote content (leaking the reader's IP). The image
    // proxy only covers <img>, so block the rest.
    FORBID_TAGS: [
      "link",
      "video",
      "audio",
      "source",
      "picture",
      "track",
      "iframe",
      "object",
      "embed",
    ],
    FORBID_ATTR: ["srcset", "poster", "background"],
  });
}

/** Sandboxed HTML email body: frameless, no inner scrollbars, auto-sizes to
 *  content height like Gmail. allow-scripts omitted so allow-same-origin is safe. */
export function HtmlBody({
  html,
  accountId,
  messageId,
  inlineAttachments,
}: {
  html: string;
  /** With messageId + inlineAttachments, resolves cid: images to the Gmail
   *  attachment endpoint. Omitted (e.g. demo mail) → cid: left as-is. */
  accountId?: string;
  messageId?: string;
  inlineAttachments?: Record<
    string,
    { attachmentId: string; mimeType: string }
  >;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [doc, setDoc] = useState("");

  useEffect(() => setDoc(sanitizeEmail(html)), [html]);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  const onLoad = () => {
    const iframe = ref.current;
    const idoc = iframe?.contentDocument;
    if (!iframe || !idoc?.body) return;

    // Resolve cid: images to the Gmail attachment endpoint — real attachments,
    // not URLs, so the image proxy can't reach them.
    if (accountId && messageId && inlineAttachments) {
      idoc.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src") ?? "";
        if (!src.toLowerCase().startsWith("cid:")) return;
        const cid = src.slice(4).replace(/^<|>$/g, "");
        const att = inlineAttachments[cid];
        if (!att) return;
        img.setAttribute(
          "src",
          `${window.location.origin}/api/message?accountId=${encodeURIComponent(accountId)}&id=${encodeURIComponent(messageId)}&attachment=${encodeURIComponent(att.attachmentId)}&mime=${encodeURIComponent(att.mimeType)}`,
        );
      });
    }

    const base = idoc.createElement("base");
    base.target = "_blank";
    idoc.head.prepend(base);
    // HTML emails assume a light canvas regardless of the app theme.
    idoc.documentElement.style.colorScheme = "light";
    // Force root to auto height so the email's height:100%/min-height chains don't
    // feed back off the iframe height we set (box grows forever); kill horizontal
    // scroll and keep wide media from overflowing the pane.
    const style = idoc.createElement("style");
    style.textContent =
      // Auto-height + no horizontal scroll (so ResizeObserver sizing works).
      "html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow-x:hidden!important}" +
      // Breathing room inside the email's own background; reads right on white + dark.
      "body{padding:16px 20px!important}" +
      // System font base so web-font emails degrade cleanly (no serif); antialiased.
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}' +
      // Reset for table-based email layouts (most HTML email is tables).
      "table{border-collapse:collapse}" +
      "img,video,table{max-width:100%!important}" +
      "img,video{height:auto}" +
      "a{word-break:break-all}";
    idoc.head.appendChild(style);

    // Guard against resize-observer feedback loops by skipping identical heights.
    let last = 0;
    const fit = () => {
      const height = Math.ceil(idoc.body.scrollHeight);
      if (height && height !== last) {
        last = height;
        iframe.style.height = `${height}px`;
      }
    };
    observerRef.current?.disconnect();
    observerRef.current = new ResizeObserver(fit);
    observerRef.current.observe(idoc.body);
    fit();

    // A failed image (dead CDN, proxy reject) shows a broken-image icon. No
    // allow-scripts means no inline onerror, so attach the handler from here
    // (allow-same-origin). Alt text → muted italic; decorative images vanish.
    const handleBroken = (img: HTMLImageElement) => {
      const alt = (img.getAttribute("alt") || "").trim();
      if (alt) {
        const span = idoc.createElement("span");
        span.textContent = alt;
        span.style.cssText = "color:#8a817a;font-size:13px;font-style:italic";
        img.replaceWith(span);
      } else {
        img.style.display = "none";
      }
      fit();
    };
    // Remote images can land after first paint and grow the body; re-fit.
    idoc.querySelectorAll("img").forEach((img) => {
      img.addEventListener("load", fit);
      img.addEventListener("error", () => handleBroken(img));
      // Caught a failure that happened before this listener attached.
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) {
        handleBroken(img);
      }
    });
    if (idoc.fonts?.ready) idoc.fonts.ready.then(fit).catch(() => {});

    // iframe swallows wheel events with no inner scroll; forward to the reader pane.
    idoc.addEventListener(
      "wheel",
      (event) => {
        const scroller = scrollParent(iframe);
        if (scroller) scroller.scrollTop += event.deltaY;
      },
      { passive: true },
    );
  };

  return (
    <iframe
      ref={ref}
      title="Message body"
      scrolling="no"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={onLoad}
      className="block w-full overflow-hidden rounded-lg bg-white"
    />
  );
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
