import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
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
import VoiceRecorderCard from "./voice-recorder-card";
import { QuestionsPage } from "./questions-page";

export const PlaygroundPage = () => {
  return (
    <>
      <div className=" h-full flex-col md:flex w-full ">
        <div className="container mx-auto flex items-center justify-between py-4 md:py-0 px-4">
          <img
            src="/annam-logo.png"
            alt="Annam Logo"
            className="h-12 md:h-16 w-auto"
          />

          <div className="flex items-center space-x-2">
            <ThemeToggleCompact />
            <UserProfileActions />
          </div>
        </div>

        <Separator />
        <Tabs defaultValue="upload" className="">
          <div className="container h-full py-6 ">
            <div className="grid gap-6 mb-5 ">
              <div className="flex">
                <TabsList className="grid  grid-cols-4 gap-1  bg-transparent/60 ">
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
                    value="submit"
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
                </TabsList>
              </div>
            </div>
            <div className="grid h-full items-stretch gap-6 md:grid-cols-[1fr_200px] ">
              <div className="md:order-1 w-screen">
                <TabsContent
                  value="upload"
                  className="mt-0 border-0 p-0 max-w-[95%]"
                >
                  <div className="min-h-[75%] bg-background p-4 ps-0">
                    <div className="container mx-auto py-8 pt-0">
                      <VoiceRecorderCard />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent
                  value="submit"
                  className="mt-0 border-0 p-0 max-w-[95%]"
                >
                  <QAInterface />
                </TabsContent>
                <TabsContent
                  value="history"
                  className="mt-0 border-0 p-0 max-w-[93%]"
                >
                  <FullSubmissionHistory />
                </TabsContent>
                <TabsContent
                  value="all_questions"
                  className="mt-0 border-0 md:px-8 px-2-0 w-full"
                >
                  <QuestionsPage/>
                </TabsContent>
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </>
  );
};
