import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Click-to-copy button: copies `value` to the clipboard and flips to a green
 * "Copied" confirmation for ~1.6s. Set `iconOnly` to drop the label (tight
 * spaces); `label`/`copiedLabel` customize the text.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  iconOnly = false,
  title,
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  iconOnly?: boolean;
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // clipboard blocked (insecure context / permissions) — nothing to do
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={title ?? label}
      aria-label={title ?? label}
      className={cn(
        "inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 font-mono text-[11px] transition-colors",
        copied
          ? "border-success/40 text-success"
          : "border-input text-muted-foreground hover:bg-muted hover:text-foreground",
        iconOnly && "w-[26px] justify-center px-0",
        className,
      )}
    >
      {copied ? (
        <CheckIcon className="size-[13px]" />
      ) : (
        <CopyIcon className="size-[13px]" />
      )}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  );
}
