import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import { HoverCard } from "@/components/atoms/hover-card";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { QAInterface } from "./QA-interface";
import { FullSubmissionHistory } from "./submission-history";
import { VoiceRecorderCard } from "./voice-recorder-card";
import { QuestionsPage } from "./questions-page";
import { BellIcon } from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { RequestsPage } from "./request-page";

export const PlaygroundPage = () => {
  const { data: user, isLoading } = useGetCurrentUser();

  return (
    <>
      {/* <div className=" h-full flex-col md:flex w-full ">
        <div className="container mx-auto flex items-center justify-between py-4 md:py-0 px-4">
          <img
            src="/annam-logo.png"
            alt="Annam Logo"
            className="h-12 md:h-16 w-auto"
          />

          <div className="flex items-center space-x-2 gap-4">
            <BellIcon className="w-5 h-5 " />
            <ThemeToggleCompact />
            <UserProfileActions />
          </div>
        </div>

        <Separator />
        <Tabs defaultValue="questions" className="">
          <div className="container h-full py-6 ">
            <div className="grid gap-6 mb-5 ">
              <div className="flex">
                <TabsList className="grid  grid-cols-4 gap-1  bg-transparent/60 ">
                  <TabsTrigger
                    value="questions"
                    className="px-4 py-2 rounded-lg transition-all duration-150 font-medium"
                  >
                    <HoverCard openDelay={150}>
                      <HoverCardTrigger asChild>
                        <span>Questions</span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-[200px] text-sm"
                        side="bottom"
                      >
                        View questions and Submit your responses
                      </HoverCardContent>
                    </HoverCard>
                  </TabsTrigger>

                  <TabsTrigger
                    value="all_questions"
                    className="px-4 py-2 rounded-lg transition-all duration-150 font-medium"
                  >
                    <HoverCard openDelay={150}>
                      <HoverCardTrigger asChild>
                        <span>All Questions</span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-[200px] text-sm"
                        side="bottom"
                      >
                        View your all Questions
                      </HoverCardContent>
                    </HoverCard>
                  </TabsTrigger>

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
                        Transcribe your live voice and upload
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
              <div className="md:order-1 w-screen">
                <TabsContent
                  value="questions"
                  className="mt-0 border-0 p-0 max-w-[95%]"
                >
                  <QAInterface />
                </TabsContent>

                <TabsContent
                  value="all_questions"
                  className="mt-0 border-0 md:px-8 px-2-0 w-full"
                >
                  <QuestionsPage />
                </TabsContent>

                <TabsContent
                  value="upload"
                  className="mt-0 border-0 p-0 max-w-[95%]"
                >
                  <div className="max-h-[70vh] overflow-hidden bg-background p-4 ps-0 ">
                    <div className="container mx-auto py-8 pt-0">
                      <VoiceRecorderCard />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  value="history"
                  className="mt-0 border-0 p-0 max-w-[93%]"
                >
                  <FullSubmissionHistory />
                </TabsContent>
              </div>
            </div>
          </div>
        </Tabs>
      </div> */}

      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-card rounded-lg shadow-lg flex flex-col items-center justify-center gap-4">
            <h3 className="text-lg font-semibold text-center">
              Fetching user details...
            </h3>

            <div className="flex items-center justify-center">
              <svg
                className="animate-spin h-10 w-10 text-green-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Please wait while we fetch your profile, preferences, and
              authorizations.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="questions" className="h-full w-full">
        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3 shrink-0">
              <img
                src="/annam-logo.png"
                alt="Annam Logo"
                className="h-10 w-auto md:h-14"
              />
            </div>

            <div className="flex-1 flex justify-center min-w-0">
              <TabsList className="flex gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0 no-scrollbar">
                <TabsTrigger
                  value="questions"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <span>Questions</span>
                </TabsTrigger>

                <TabsTrigger
                  value="all_questions"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <span>All Questions</span>
                </TabsTrigger>

                {user && user.role == "moderator" && (
                  <TabsTrigger
                    value="request_queue"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <span>Request Queue</span>
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="upload"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Upload</span>
                  </HoverCard>
                </TabsTrigger>

                <TabsTrigger
                  value="history"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>History</span>
                  </HoverCard>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <BellIcon className="w-5 h-5" />
              <ThemeToggleCompact />
              <UserProfileActions />
            </div>
          </div>
        </header>

        <div className="container h-full py-6">
          <div className="grid h-full items-stretch gap-6 ">
            <div className="md:order-1 w-full ">
              <TabsContent value="questions" className="mt-0 border-0 p-0 ">
                <QAInterface />
              </TabsContent>

              <TabsContent
                value="all_questions"
                className="mt-0 border-0 md:px-8 px-2 w-full"
              >
                <QuestionsPage userRole={user?.role} />
              </TabsContent>
              {user && user.role == "moderator" && (
                <TabsContent
                  value="request_queue"
                  className="mt-0 border-0 md:px-8 px-2 w-full"
                >
                  <RequestsPage />
                </TabsContent>
              )}
              <TabsContent
                value="upload"
                className="mt-0 border-0 p-0 max-w-[95%]"
              >
                <div className="max-h-[70vh] overflow-hidden bg-background p-4 ps-0">
                  <div className="container mx-auto py-8 pt-0">
                    <VoiceRecorderCard />
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="history"
                className="mt-0 border-0 p-0 max-w-[98%]"
              >
                <FullSubmissionHistory userRole={user?.role!} />
              </TabsContent>
            </div>
          </div>
        </div>
      </Tabs>
    </>
  );
};
