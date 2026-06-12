import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/api")({
  component: () => (
    <DeveloperPage title="API">
      {/* Drop the API description here. */}
      Description coming soon.
    </DeveloperPage>
  ),
});
