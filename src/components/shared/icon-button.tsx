import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

/**
 * Ghost icon button + tooltip, optionally with ⌘-key chips. Wraps the shadcn
 * Button (size `icon-sm`); the editor toolbar and composer footer adapt it.
 */
export function IconButton({
  label,
  keys,
  active,
  disabled,
  onClick,
  className,
  side,
  keepFocus,
  children,
}: {
  label: string;
  /** Keyboard shortcut, shown as chips in the tooltip. */
  keys?: string[];
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  /** Editor toolbars: don't let mousedown steal the editor selection. */
  keepFocus?: boolean;
  children: ReactNode;
}) {
  const hint =
    keys && keys.length > 0 ? (
      <>
        {label}
        <KbdGroup>
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </>
    ) : (
      label
    );
  return (
    <Hint label={hint} side={side}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        data-active={active || undefined}
        onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
        onClick={onClick}
        className={cn(
          "rounded-md text-muted-foreground hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground [&_svg]:size-[15px]",
          className,
        )}
      >
        {children}
      </Button>
    </Hint>
  );
}
