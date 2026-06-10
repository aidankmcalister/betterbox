import { createFileRoute } from "@tanstack/react-router";

/** /sent — the `_app` layout reads the path to select this folder. */
export const Route = createFileRoute("/_app/sent")({
  component: () => null,
});
