import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div data-testid="dashboard-page">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Use the sidebar to navigate to workflows or credentials.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
