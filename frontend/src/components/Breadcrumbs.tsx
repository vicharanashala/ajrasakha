import { useRouter, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const routeLabels: Record<string, string> = {
  "": "Home",
  auth: "Sign In",
  home: "Dashboard",
  profile: "Profile",
  audit: "Audit Trail",
  history: "History",
  notifications: "Notifications",
  "flags-reported": "Flags & Reports",
  "pae-expert": "PAE Expert",
  coordinator: "Coordinator",
  "whatsapp-history": "WhatsApp History",
};

const paramLabels: Record<string, string> = {
  userId: "User Details",
};

function Breadcrumbs({ className }: { className?: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = router.state.location.pathname;

  const segments = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const trail: Array<{ label: string; path: string; isClickable: boolean }> =
      [];

    let accumulated = "";
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i];
      accumulated += "/" + segment;

      const isLast = i === parts.length - 1;
      let label = routeLabels[segment] || segment;

      const prevSegment = parts[i - 1];
      if (prevSegment && paramLabels[prevSegment]) {
        label = segment;
      }

      trail.push({
        label,
        path: accumulated,
        isClickable: !isLast,
      });
    }

    return trail;
  }, [pathname]);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("mb-4", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <button
            onClick={() => navigate({ to: "/home" })}
            className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            aria-label="Home"
          >
            <Home className="size-4" />
          </button>
        </li>
        {segments.length > 0 && (
          <li
            role="presentation"
            aria-hidden="true"
            className="[&>svg]:size-3.5"
          >
            <ChevronRight />
          </li>
        )}
        {segments.map((segment, idx) => (
          <li key={segment.path} className="inline-flex items-center gap-1.5">
            {segment.isClickable ? (
              <button
                onClick={() => navigate({ to: segment.path })}
                className="hover:text-foreground transition-colors"
              >
                {segment.label}
              </button>
            ) : (
              <span
                role="link"
                aria-disabled="true"
                aria-current="page"
                className="text-foreground font-medium"
              >
                {segment.label}
              </span>
            )}
            {idx < segments.length - 1 && (
              <li
                role="presentation"
                aria-hidden="true"
                className="[&>svg]:size-3.5"
              >
                <ChevronRight />
              </li>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export { Breadcrumbs };
