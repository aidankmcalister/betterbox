import {
  CircleDotIcon,
  GripVerticalIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";

import { useSession } from "@/lib/auth/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { useTileDrag } from "@/components/tile-board";
import { GithubIssuesPage } from "@/components/integrations/github-issues";
import { useGithubIssuesQuery } from "@/lib/github/github-queries";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";

/** GitHub issues as an on-demand board panel — assigned to or opened by you. */
export function GithubIssuesPane({
  paneId,
  onClose,
}: {
  paneId: string;
  onClose: () => void;
}) {
  const beginHeaderDrag = useTileDrag();
  const { data: session } = useSession();
  const { demoMode } = useSettings();
  const query = useGithubIssuesQuery(!!session && !demoMode);
  const live = !demoMode && query.data?.linked;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
      >
        <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
        <CircleDotIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          Issues
        </span>
        {live && (
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-success">
            <span className="size-1.5 rounded-full bg-success" />
            live
          </span>
        )}
        {!demoMode && (
          <Hint label="Refresh">
            <button
              type="button"
              onClick={() => query.refetch()}
              className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <RefreshCwIcon
                className={cn("size-3.5", query.isFetching && "animate-spin")}
              />
            </button>
          </Hint>
        )}
        <Hint label="Close panel">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <GithubIssuesPage signedIn={!!session} demo={demoMode} />
      </div>
    </div>
  );
}
