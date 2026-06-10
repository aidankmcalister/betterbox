import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";

/**
 * Sanitize an HTML email body. DOMPurify needs a real DOM, so this is a
 * no-op during SSR (the iframe fills in after the component mounts on the
 * client). The img hook routes every remote image through our proxy:
 * tracker blockers kill direct requests to sender CDNs (licdn.com et al.),
 * and proxying keeps the reader's IP out of tracking pixels. srcset goes —
 * candidates would each need the same rewrite and emails don't rely on it.
 */
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

/**
 * Sanitized HTML email body in a sandboxed iframe so message markup and CSS
 * can't leak into (or inherit from) the app. The sandbox omits allow-scripts,
 * which makes allow-same-origin safe — we only use it to inject a
 * `<base target="_blank">` and keep the iframe height fitted to its content.
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

    const fit = () => {
      iframe.style.height = `${idoc.documentElement.scrollHeight}px`;
    };
    observerRef.current?.disconnect();
    observerRef.current = new ResizeObserver(fit);
    observerRef.current.observe(idoc.body);
    fit();
  };

  return (
    <iframe
      ref={ref}
      title="Message body"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={onLoad}
      className="block w-full rounded-lg border bg-white"
    />
  );
}
