import { useState, type ReactNode } from "react";
import { WrapTextIcon } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

/**
 * Raw RFC 822 source. Theme-aware (reads in light and dark), monospace, with
 * header names emphasized, folded continuation lines dimmed, and MIME
 * boundaries called out. Wraps long lines by default for readability; the chip
 * switches to exact line structure (horizontal scroll) when you need it.
 */
export function RawView({ mime }: { mime: string }) {
  const [wrap, setWrap] = useState(true);
  // Real byte count of the source (UTF-8), not the JS UTF-16 unit count.
  const bytes = new Intl.NumberFormat().format(
    new TextEncoder().encode(mime).length,
  );
  const lines = mime.split("\n");

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur-sm">
        <span className="font-mono text-[11px] font-medium text-foreground">
          message/rfc822
        </span>
        <span className="font-mono text-[11px] text-muted-foreground/70">
          raw source
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/60 tabular-nums">
          {bytes} bytes
        </span>
        <CopyButton
          value={mime}
          label="Copy"
          title="Copy raw source"
          className="h-[22px] text-[10.5px]"
        />
        <Hint label={wrap ? "Show exact line structure" : "Wrap long lines"}>
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap((current) => !current)}
            className={cn(
              "inline-flex h-[22px] cursor-pointer items-center gap-[5px] rounded-md border px-2 font-mono text-[10.5px] transition-colors [&_svg]:size-[11px]",
              wrap
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <WrapTextIcon /> wrap
          </button>
        </Hint>
      </div>
      {/* Verbatim source: lines are coloured with inline spans and joined by
          real newlines, so the rendered text — and a copy of it — is byte-for-
          byte what the server returned (no injected placeholders). */}
      <pre
        className={cn(
          "m-0 px-5 pt-4 pb-14 font-mono text-[12px] leading-[1.7] selection:bg-primary/20",
          wrap
            ? "wrap-break-word whitespace-pre-wrap"
            : "overflow-x-auto whitespace-pre",
        )}
      >
        {lines.map((line, i) => (
          <RawLine key={i} line={line} newline={i < lines.length - 1} />
        ))}
      </pre>
    </div>
  );
}

function RawLine({ line, newline }: { line: string; newline: boolean }) {
  let node: ReactNode;
  if (/^--/.test(line)) {
    // MIME boundary marker
    node = <span className="font-medium text-label-purple">{line}</span>;
  } else if (/^\s/.test(line)) {
    // Folded continuation of the previous header
    node = <span className="text-muted-foreground/55">{line}</span>;
  } else {
    const header = line.match(/^([A-Za-z][A-Za-z0-9-]*):(.*)$/);
    node = header ? (
      <>
        <span className="font-medium text-foreground">{header[1]}</span>
        <span className="text-muted-foreground/40">:</span>
        <span className="text-muted-foreground">{header[2]}</span>
      </>
    ) : (
      <span className="text-muted-foreground">{line}</span>
    );
  }
  // The literal "\n" (not a <div>) keeps blank lines and exact spacing intact.
  return (
    <>
      {node}
      {newline ? "\n" : null}
    </>
  );
}
