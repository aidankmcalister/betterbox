import { createFileRoute } from "@tanstack/react-router";

/** /analytics — the `_app` layout reads the path to swap the board for the
 *  Analytics pane. */
export const Route = createFileRoute("/_app/analytics")({
  component: () => null,
});
