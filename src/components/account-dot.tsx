import { cn } from "@/lib/utils";

/**
 * The single source of accountId → color mapping (Component Spec: never assign
 * dot colors anywhere else). Colors come from the label palette; accounts get
 * a stable index from their position in the accounts list.
 */
const DOT_COLORS = [
  "var(--color-label-blue)",
  "var(--color-label-green)",
  "var(--color-label-purple)",
  "var(--color-label-orange)",
  "var(--color-label-yellow)",
  "var(--color-label-red)",
];

export function accountDotColor(index: number): string {
  return DOT_COLORS[index % DOT_COLORS.length];
}

export function AccountDot({
  colorIndex,
  unread = true,
  className,
}: {
  colorIndex: number;
  unread?: boolean;
  className?: string;
}) {
  const color = accountDotColor(colorIndex);
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[7px] shrink-0 rounded-full", className)}
      style={
        unread
          ? {
              background: color,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)`,
            }
          : {
              background: "transparent",
              boxShadow: `inset 0 0 0 1.5px ${color}`,
              opacity: 0.5,
            }
      }
    />
  );
}
