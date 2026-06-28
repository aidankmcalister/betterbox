import { Link } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";

export function NotFound() {
  return (
    <main className="grid min-h-svh w-full place-items-center bg-canvas text-ink">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-ink-subtle transition-colors hover:text-ink"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
            <MailIcon className="size-5" />
          </span>
          <span className="font-mono text-[13px] font-semibold">BetterBox</span>
        </Link>

        <div className="flex flex-col items-center gap-1.5">
          <p className="font-mono text-[11.5px] text-ink-tertiary">404</p>
          <h1 className="text-[24px] leading-[1.1] font-semibold tracking-[-0.5px]">
            Page not found
          </h1>
          <p className="max-w-[340px] text-[14px] leading-[1.6] text-ink-muted">
            This page does not exist or has moved. Check the URL, or head back
            to your inbox.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 font-mono text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          Back to BetterBox
        </Link>
      </div>
    </main>
  );
}
