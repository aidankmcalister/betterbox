import { createFileRoute } from "@tanstack/react-router";

/** /spam — the `_app` layout reads the path to select this folder. */
export const Route = createFileRoute("/_app/spam")({
  component: () => null,
});
