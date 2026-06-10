import { createFileRoute } from "@tanstack/react-router";

/** /trash — the `_app` layout reads the path to select this folder. */
export const Route = createFileRoute("/_app/trash")({
  component: () => null,
});
