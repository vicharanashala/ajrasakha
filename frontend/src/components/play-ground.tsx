import { LogOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import { Textarea } from "@/components/atoms/textarea";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/atoms/hover-card";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { QAInterface } from "./QA-interface";
import { FullSubmissionHistory } from "./submission-history";

export const PlaygroundPage = () => {
  return (
    <>
      <div className="md:hidden">
        <img
          src="/examples/playground-light.png"
          width={1280}
          height={916}
          alt="Playground"
          className="block dark:hidden"
        />
        <img
          src="/examples/playground-dark.png"
          width={1280}
          height={916}
          alt="Playground"
          className="hidden dark:block"
        />
      </div>
      <div className="hidden h-full flex-col md:flex ">
        <div className="container flex flex-col items-start justify-between space-y-2 py-4 sm:flex-row sm:items-center sm:space-y-0 md:h-16">
          <img src="/annam-logo.png" alt="Annam Logo" className="h-18 w-auto" />
          <div className="ml-auto flex w-full space-x-2 sm:justify-end">
            <ThemeToggleCompact />
            <UserProfileActions />
          </div>
        </div>
        <Separator />
        <Tabs defaultValue="submit" className="">
          <div className="container h-full py-6 ">
            <div className="grid gap-6 mb-5 ">
              <div className="flex">
                <TabsList className="grid  grid-cols-3 gap-1  bg-transparent/60 ">
                  <TabsTrigger
                    value="upload"
                    className="px-4 rounded-lg  transition-all duration-150 font-medium"
                  >
                    <HoverCard openDelay={150}>
                      <HoverCardTrigger asChild>
                        <span>Upload</span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-[200px] text-sm"
                        side="bottom"
                      >
                        Upload a call recording or audio file
                      </HoverCardContent>
                    </HoverCard>
                  </TabsTrigger>

                  <TabsTrigger
                    value="submit"
                    className="px-4 py-2 rounded-lg transition-all duration-150 font-medium"
                  >
                    <HoverCard openDelay={150}>
                      <HoverCardTrigger asChild>
                        <span>Responses</span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-[200px] text-sm"
                        side="bottom"
                      >
                        Submit your responses for questions
                      </HoverCardContent>
                    </HoverCard>
                  </TabsTrigger>

                  <TabsTrigger
                    value="history"
                    className="px-4 py-2 rounded-lg transition-all duration-150 font-medium"
                  >
                    <HoverCard openDelay={150}>
                      <HoverCardTrigger asChild>
                        <span>History</span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-[200px] text-sm"
                        side="bottom"
                      >
                        View your all response submissoins
                      </HoverCardContent>
                    </HoverCard>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            <div className="grid h-full items-stretch gap-6 md:grid-cols-[1fr_200px] ">
              <div className="hidden flex-col space-y-4 sm:flex md:order-2"></div>
              <div className="md:order-1 w-screen">
                <TabsContent value="upload" className="mt-0 border-0 p-0">
                  <div className="flex h-full flex-col space-y-4">
                    <Textarea
                      placeholder="Write a tagline for an ice cream shop"
                      className="min-h-[400px] flex-1 p-4 md:min-h-[700px] lg:min-h-[700px]"
                    />
                    <div className="flex items-center space-x-2">
                      <Button>Submit</Button>
                      <Button variant="secondary">
                        <span className="sr-only">Show history</span>
                        <RotateCcw />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="submit" className="mt-0 border-0 p-0">
                  <QAInterface />
                </TabsContent>
                <TabsContent value="history" className="mt-0 border-0 p-0">
                  <FullSubmissionHistory />
                </TabsContent>
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </>
  );
};
