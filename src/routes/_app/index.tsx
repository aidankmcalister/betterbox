import { createFileRoute } from "@tanstack/react-router";

/** The inbox — all UI lives in the `_app` layout; folders are sibling paths. */
export const Route = createFileRoute("/_app/")({
  component: () => null,
});
