import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/issues")({
  component: () => (
    <DeveloperPage title="Issues">
      <div className="max-w-lg space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connect Linear and your assigned issues show up here alongside your
          inbox. Comments, status changes, and what needs your attention,
          without leaving mail.
        </p>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="text-muted-foreground/40 select-none">·</span>
            See issues assigned to you across all linked workspaces
          </li>
          <li className="flex gap-3">
            <span className="text-muted-foreground/40 select-none">·</span>
            Filter by status, priority, and project
          </li>
          <li className="flex gap-3">
            <span className="text-muted-foreground/40 select-none">·</span>
            Jira support coming after Linear
          </li>
        </ul>
      </div>
    </DeveloperPage>
  ),
});
