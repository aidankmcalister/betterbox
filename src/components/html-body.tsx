import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";

// DOMPurify needs a real DOM; no-op during SSR.
//
// Privacy/fidelity trade-off: <img> sources are proxied through our endpoint to
// block tracker pixels and CDN-side IP logging. Remote stylesheets, web fonts,
// and media are allowed through so marketing emails render with their real
// fonts, colors, and layout (they looked broken otherwise) — these can still
// phone home, which is the cost of rendering them faithfully.
let hookRegistered = false;
function sanitizeEmail(html: string): string {
  if (typeof window === "undefined") return "";
  if (!hookRegistered) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "IMG") {
        node.removeAttribute("srcset");
        const src = node.getAttribute("src");
        if (src && /^https?:\/\//i.test(src)) {
          // Absolute origin, not root-relative: inside the srcdoc iframe a
          // "/api/…" path resolves against about:srcdoc, not the app, and 404s.
          node.setAttribute(
            "src",
            `${window.location.origin}/api/image-proxy?url=${encodeURIComponent(src)}`,
          );
        }
      }
      // Any link that leaves the message opens in a new tab.
      if (node.tagName === "A" && node.getAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    hookRegistered = true;
  }
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    // Let real email styling render: external stylesheets + web fonts, plus
    // common media wrappers. <style>/inline styles are allowed by default.
    ADD_TAGS: ["link", "style", "video", "audio", "source", "picture"],
    ADD_ATTR: [
      "rel",
      "href",
      "media",
      "type",
      "target",
      "controls",
      "poster",
      "srcset",
      "sizes",
    ],
  });
}

/**
 * Sandboxed HTML email body. Renders seamlessly into the reader (no visible
 * frame, no inner scrollbars) and auto-sizes to its content height like Gmail.
 * allow-scripts is intentionally omitted so allow-same-origin stays safe.
 */
export function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [doc, setDoc] = useState("");

  useEffect(() => setDoc(sanitizeEmail(html)), [html]);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  const onLoad = () => {
    const iframe = ref.current;
    const idoc = iframe?.contentDocument;
    if (!iframe || !idoc?.body) return;

    const base = idoc.createElement("base");
    base.target = "_blank";
    idoc.head.prepend(base);
    // HTML emails assume a light canvas regardless of the app theme.
    idoc.documentElement.style.colorScheme = "light";
    // Force the root to auto height so the email's height:100% / min-height
    // chains don't feed back off the iframe height we set (the cause of the box
    // growing forever); suppress the horizontal scrollbar and keep wide media
    // from overflowing the pane width.
    const style = idoc.createElement("style");
    style.textContent =
      "html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0;overflow-x:hidden!important}" +
      "img,video,table{max-width:100%!important}" +
      "img,video{height:auto}";
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
    // Remote fonts/images can land after first paint and grow the body; re-fit.
    idoc
      .querySelectorAll("img")
      .forEach((img) => img.addEventListener("load", fit));
    if (idoc.fonts?.ready) idoc.fonts.ready.then(fit).catch(() => {});

    // iframe swallows wheel events even with no inner scroll; forward to the reader pane.
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
