import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";

// DOMPurify needs a real DOM; no-op during SSR. The img hook proxies remote
// images to block tracker pixels and prevent CDN-side IP tracking; srcset is
// stripped because each candidate would need the same rewrite.
let hookRegistered = false;
function sanitizeEmail(html: string): string {
  if (typeof window === "undefined") return "";
  if (!hookRegistered) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName !== "IMG") return;
      node.removeAttribute("srcset");
      const src = node.getAttribute("src");
      if (src && /^https?:\/\//i.test(src)) {
        node.setAttribute(
          "src",
          `/api/image-proxy?url=${encodeURIComponent(src)}`,
        );
      }
    });
    hookRegistered = true;
  }
  return DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true });
}

// Sandboxed iframe: email markup/CSS can't leak into the app. allow-scripts is
// omitted intentionally, which makes allow-same-origin safe for DOM injection.
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
    // chains don't feed back off the iframe height we set (the cause of the
    // box growing forever), and keep wide images from scrolling sideways.
    const style = idoc.createElement("style");
    style.textContent =
      "html,body{height:auto!important;min-height:0!important;margin:0}" +
      "img{max-width:100%;height:auto}";
    idoc.head.appendChild(style);

    // Guard against resize-observer feedback loops by skipping identical heights.
    let last = 0;
    const fit = () => {
      const height = idoc.body.scrollHeight;
      if (height && height !== last) {
        last = height;
        iframe.style.height = `${height}px`;
      }
    };
    observerRef.current?.disconnect();
    observerRef.current = new ResizeObserver(fit);
    observerRef.current.observe(idoc.body);
    fit();

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
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={onLoad}
      className="block w-full overflow-x-auto rounded-lg border bg-white"
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
