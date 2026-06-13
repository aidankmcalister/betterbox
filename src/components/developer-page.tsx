import type { ReactNode } from "react";

/**
 * Bare scaffold for the "Soon" developer pages (Webhooks, Rules, API, PRs).
 * Each route drops its own description in as children — that's the whole point;
 * keep this layout thin so the content is what stands out.
 */
export function DeveloperPage({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.5px] text-accent-2 uppercase">
          Soon
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.3px]">
          {title}
        </h1>
        <div className="mt-4 text-sm leading-relaxed text-pretty text-muted-foreground">
          {children ?? "Description coming soon."}
        </div>
      </div>
    </div>
  );
}
