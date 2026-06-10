import type { ReactNode } from "react";

/**
 * Raw RFC 822 source (design: terminal surface, 100% mono — header names in
 * syntax blue, folded continuation lines dimmed, MIME boundaries purple).
 */
export function RawView({ mime }: { mime: string }) {
  return (
    <div className="min-h-full bg-term">
      <div className="sticky top-0 flex items-center gap-2 border-b bg-term px-4 py-[9px]">
        <span className="font-mono text-[13px] text-accent-2-hover">❯</span>
        <span className="font-mono text-[11.5px] text-ink-subtle">
          message/rfc822 · raw source
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-tertiary">
          {mime.length} bytes
        </span>
      </div>
      <pre className="m-0 px-5 pt-4 pb-14 font-mono text-xs leading-[1.65] break-words whitespace-pre-wrap text-term-text">
        {mime.split("\n").map((line, i) => (
          <RawLine key={i} line={line} />
        ))}
      </pre>
    </div>
  );
}

function RawLine({ line }: { line: string }) {
  let node: ReactNode;
  if (/^----/.test(line)) {
    node = <span className="text-label-purple">{line}</span>;
  } else if (/^\s/.test(line)) {
    node = <span className="text-ink-tertiary">{line}</span>;
  } else {
    const header = line.match(/^([A-Za-z][A-Za-z0-9-]*):(.*)$/);
    node = header ? (
      <>
        <span className="text-label-blue">{header[1]}</span>
        <span className="text-ink-tertiary">:</span>
        <span>{header[2]}</span>
      </>
    ) : (
      <span>{line || "​"}</span>
    );
  }
  return <div>{node}</div>;
}
