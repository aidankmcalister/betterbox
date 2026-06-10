import { createFileRoute } from "@tanstack/react-router";

/** /archived — the `_app` layout reads the path to select this folder. */
export const Route = createFileRoute("/_app/archived")({
  component: () => null,
});
