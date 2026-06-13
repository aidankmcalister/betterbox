import { createFileRoute } from "@tanstack/react-router";
import { PullRequestsPage } from "@/components/pull-requests";
import { useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/_app/pull-requests")({
  component: PullRequestsRoute,
});

function PullRequestsRoute() {
  const { data: session } = useSession();
  // Demo mode masks real data for recordings — show seeded PRs, not the API.
  const { demoMode } = useSettings();
  return <PullRequestsPage signedIn={!!session} demo={demoMode} />;
}
