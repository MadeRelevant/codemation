export function getPageTitle(pathname: string, workflows: ReadonlyArray<{ id: string; name: string }>): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/credentials") return "Credentials";
  if (pathname === "/users") return "Users";
  if (pathname === "/workflows") return "Workflows";
  const workflowMatch = pathname.match(/^\/workflows\/([^/]+)/);
  if (workflowMatch) {
    const w = workflows.find((x) => x.id === decodeURIComponent(workflowMatch[1]));
    return w?.name ?? "Workflow";
  }
  return "Codemation";
}
