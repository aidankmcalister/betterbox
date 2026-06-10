import { createFileRoute } from "@tanstack/react-router";

/** /drafts — the `_app` layout reads the path to select this folder. */
export const Route = createFileRoute("/_app/drafts")({
  component: () => null,
});
