import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { DashboardContentEditor } from "./DashboardContentEditor";
import { MediaManager } from "./MediaManager";

/**
 * Single admin screen for the public dashboard: the narrative content blocks and the
 * media library (carousel images, outreach images, outreach videos) live side by side
 * under one "Edit ACE Dashboard" entry point.
 */
export const DashboardAdmin = () => {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Edit ACE Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manage what the public dashboard shows — the written content and the media.
        </p>
      </div>

      <Tabs defaultValue="content" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
        </TabsList>

        {/* Each child already renders its own heading/padding, so strip the outer padding. */}
        <TabsContent value="content" className="mt-0">
          <div className="[&>div]:mx-0 [&>div]:max-w-none [&>div]:p-0">
            <DashboardContentEditor />
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-0">
          <div className="[&>div]:mx-0 [&>div]:max-w-none [&>div]:p-0">
            <MediaManager />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
