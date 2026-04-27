import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/notifications/")({
    component: Notification,
});

function Notification() {
    const navigate = useNavigate();

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
                <h1 className="text-2xl font-bold">Notifications</h1>

                <p className="text-sm text-muted-foreground">
                    This page is temporarily disabled. Please use the notifications bell
                    icon in the header to view your notifications.
                </p>

                <button
                    type="button"
                    onClick={() => navigate({ to: "/home" })}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                    Go to Home
                </button>
            </div>
        </div>
    );
}

