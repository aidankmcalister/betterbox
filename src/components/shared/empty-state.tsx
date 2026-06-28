import type { ComponentType, ReactNode } from "react";

/**
 * Centered empty-state card — icon in a rounded square, title, description, and
 * an optional action. Shared by the settings snippet/signature lists.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="max-w-[340px]">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
