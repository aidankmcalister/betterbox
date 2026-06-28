import type { Account } from "@/lib/account";
import { useTileDrag } from "@/components/tile-board";
import { Composer } from "@/components/editor/composer";
import { COMPOSE_PANE_ID, type ComposePane } from "../tiles-context";

/** The composer docked as a board tile — its header doubles as the drag handle. */
export function ComposePaneTile({
  compose,
  accounts,
}: {
  compose: ComposePane;
  accounts: Account[];
}) {
  const beginHeaderDrag = useTileDrag();
  return (
    <Composer
      inPane
      open
      onOpenChange={compose.onOpenChange}
      accounts={accounts}
      content={compose.content}
      onContentChange={compose.onContentChange}
      draft={compose.draftRef}
      onHeaderPointerDown={(event) => beginHeaderDrag(event, COMPOSE_PANE_ID)}
    />
  );
}
