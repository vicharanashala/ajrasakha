import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card";

export function UserDetailsView() {
  return (
    <div style={{ padding: "0px 20px 20px 20px", flex: 1, overflowY: "auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h2
          className="text-lg font-semibold text-(--foreground)"
          style={{ margin: 0 }}
        >
          User Details
        </h2>
        <p
          className="text-xs text-(--muted-foreground)"
          style={{ marginTop: 4 }}
        >
          View and manage all registered users and their activity
        </p>
      </div>

      {/* Placeholder cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-semibold text-[#3AAA5A]">—</span>
            <span className="text-xs text-(--muted-foreground)">Total Users</span>
          </CardContent>
        </Card>
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-semibold text-[#3AAA5A]">—</span>
            <span className="text-xs text-(--muted-foreground)">Active Today</span>
          </CardContent>
        </Card>
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-semibold text-[#3AAA5A]">—</span>
            <span className="text-xs text-(--muted-foreground)">New This Month</span>
          </CardContent>
        </Card>
      </div>

      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader>
          <CardTitle className="text-sm font-medium">User List</CardTitle>
          <CardDescription>
            This section is under development. User details, activity logs, and management tools will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center justify-center py-16 text-(--muted-foreground)"
            style={{ gap: 12 }}
          >
            <svg width={48} height={48} viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="20" r="8" stroke="currentColor" strokeWidth="2" />
              <path
                d="M8 42c0-8.8 7.2-16 16-16s16 7.2 16 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm font-medium">Coming soon</span>
            <span className="text-xs" style={{ maxWidth: 320, textAlign: "center" }}>
              User details, search, filters, and individual activity breakdowns will be available here.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
