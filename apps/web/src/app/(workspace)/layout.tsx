import { getWorkspaceSession } from "@/lib/workspace";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { membership, user } = await getWorkspaceSession();
  if (!membership || !user) return children;
  return <WorkspaceShell membership={membership} user={user} hasSeason={membership.organization.hasSeason ?? false}>{children}</WorkspaceShell>;
}
