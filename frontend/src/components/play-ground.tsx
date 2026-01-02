import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { QAInterface } from "./QA-interface";
import { FullSubmissionHistory } from "./submission-history";
import { VoiceRecorderCard } from "./voice-recorder-card";
import { QuestionsPage } from "./questions-page";
import { BellIcon } from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { RequestsPage } from "./request-page";
import { useNavigate } from "@tanstack/react-router";
import { initializeNotifications } from "@/services/pushService";
import { useEffect, useState } from "react";
import { PerformanceMatrics } from "./performanceMatrics";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { MobileSidebar } from "./mobile-sidebar";
import { HoverCard } from "./atoms/hover-card";
import { UserManagement } from "./user-management";
import { ChristmasCap, Dashboard } from "./dashboard";
import Spinner from "./atoms/spinner";
import { ExpertDashboard } from "./ExpertDashboard";

export const PlaygroundPage = () => {
  const { data: user, isLoading } = useGetCurrentUser({});
  const userId = user?._id?.toString();
  const navigate = useNavigate();
  const {
    selectedQuestionId,
    setSelectedQuestionId,
    selectedRequestId,
    setSelectedRequestId,
    selectedCommentId,
    setSelectedCommentId,
    selectedHistoryId,
    setSelectedHistoryId,
    selectedQuestionType,
    setSelectedQuestionType
  } = useSelectedQuestion();
  //const [activeTab, setActiveTab] = useState<string>("performance");
  // Initialize from localStorage or default
 
  const [activeTab, setActiveTab] = useState<string>("all_questions");
  const getStorageKey = (user?: { email?: string }) => {
    if (!user?.email) return null;
    return `playground_active_tab_${user.email}`;
  };
  // Set default tab based on user role when user data loads
  useEffect(() => {
    if (!user) return;
    const storageKey = getStorageKey(user);
    if (!storageKey) return;
    const savedTab = localStorage.getItem(storageKey);
    if (savedTab) {
      setActiveTab(savedTab);
    } else {
      const defaultTab =
        user.role === "expert" ? "questions" : "performance";
  
      setActiveTab(defaultTab);
      localStorage.setItem(storageKey, defaultTab);
    }
   // setActiveTab(savedTab);
  }, [user]);
  // Only update tab when there's a specific selection that requires navigation
  useEffect(() => {
    if (!user) return;

    let calculatedTab: string | null = null;

    // Only set calculatedTab if there's an explicit selection
    if (selectedRequestId) {
      calculatedTab = "request_queue";
    } else if (selectedHistoryId) {
      calculatedTab = "history";
    } else if (selectedQuestionId) {
      calculatedTab = "questions";
    } else if (selectedCommentId) {
      calculatedTab = "all_questions";
    }
    const storageKey = getStorageKey(user);
    if (!storageKey) return;
    // Only update if we have a specific tab to navigate to
    if (calculatedTab && calculatedTab !== activeTab) {
      setActiveTab(calculatedTab);
      localStorage.setItem(storageKey, calculatedTab);
    }
  }, [
    user,
    selectedQuestionId,
    selectedRequestId,
    selectedCommentId,
    selectedHistoryId,
    activeTab
  ]);


    
    
   
  // const defaultTab = (() => {
  //   if (!user) return "performance";
  //   if (user.role !== "expert") return "performance";
  //   if (selectedRequestId) return "request_queue"; // ← Auto-open Request Queue
  //   if (selectedQuestionId) return "questions";
  //   if (selectedCommentId) return "all_questions";
  //   return "questions";
  // })();
  const handleTabChange = (value: string) => {
    if (!user) return;
    const storageKey = getStorageKey(user);
    if (!storageKey) return;
    setActiveTab(value);
    localStorage.setItem(storageKey, value);
    
    if (value !== "questions") {
      setSelectedQuestionId(null);
    }

    if (value !== "request_queue") {
      setSelectedRequestId(null);
    }

    if (value !== "all_questions") {
      setSelectedCommentId(null);
    }
    if (value !== "history") {
      setSelectedHistoryId(null);
    }
  };
  useEffect(() => {
    initializeNotifications();
  }, [userId]);

  return (
    <>
      {isLoading && (
        // <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-10">
        //   <div className="w-full max-w-sm p-6 bg-card rounded-lg shadow-lg flex flex-col items-center justify-center gap-4 ">
        //     <h3 className="text-lg font-semibold text-center">
        //       Fetching user details...
        //     </h3>

        //     <div className="flex items-center justify-center">
        //       <svg
        //         className="animate-spin h-10 w-10 text-green-500"
        //         xmlns="http://www.w3.org/2000/svg"
        //         fill="none"
        //         viewBox="0 0 24 24"
        //       >
        //         <circle
        //           className="opacity-25"
        //           cx="12"
        //           cy="12"
        //           r="10"
        //           stroke="currentColor"
        //           strokeWidth="4"
        //         />
        //         <path
        //           className="opacity-75"
        //           fill="currentColor"
        //           d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        //         />
        //       </svg>
        //     </div>

        //     <p className="text-sm text-muted-foreground text-center">
        //       Please wait while we fetch your profile, preferences, and
        //       authorizations.
        //     </p>
        //   </div>
        // </div>
        <Spinner text="Fetching user details" />
      )}

      <Tabs
        key={user?.role}
        value={activeTab}
        onValueChange={handleTabChange}
        className="h-full w-full"
      >
        {/* <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className=" mx-auto flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3 shrink-0">
              <img
                src="/annam-logo.png"
                alt="Annam Logo"
                className="h-10 w-auto md:h-14"
              />
            </div>

            <div className="flex-1 flex justify-center min-w-0">
              <TabsList className="flex gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0 no-scrollbar">
                {user && user.role !== "expert" && (
                  <TabsTrigger
                    value="performance"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>Performance</span>
                    </HoverCard>
                  </TabsTrigger>
                )}

                {user && user.role == "expert" && (
                  <TabsTrigger
                    value="questions"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <span>Questions</span>
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="all_questions"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <span>All Questions</span>
                </TabsTrigger>

                {user && user.role !== "expert" && (
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
                    <span>Agents Interface</span>
                  </HoverCard>
                </TabsTrigger>

                {user && (
                  <TabsTrigger
                    value="history"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>History</span>
                    </HoverCard>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="flex items-center gap-4 relative shrink-0">
              <div className="relative flex items-center justify-center">
                <button
                  onClick={() => navigate({ to: "/notifications" })}
                  className="relative p-1 rounded-md hover:bg-accent transition-colors"
                >
                  <BellIcon className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                  {user?.notifications !== undefined &&
                    user.notifications > 0 && (
                      <span className="absolute -top-[4px] -right-[12px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white shadow-sm leading-none">
                        {user.notifications > 99 ? "99+" : user.notifications}
                      </span>
                    )}
                </button>
              </div>

              <ThemeToggleCompact />

              <UserProfileActions />
            </div>
          </div>
        </header> */}

        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex items-center justify-between gap-4 px-4 py-3">
            {/* Logo */}
            {/* <div className="flex items-center gap-3 shrink-0">
              <img
                src="/annam-logo.png"
                alt="Annam Logo"
                className="h-10 w-auto md:h-14"
              />
            </div> */}
            <div className="relative flex items-center gap-3 shrink-0">
              {/* Christmas Cap */}
              <ChristmasCap
                className="
                  hidden 
                  md:block
                  absolute
                  -top-1
                  -left-4.5
                  w-10
                  h-10
                  rotate-[-30deg]
                  text-black/30
                  pointer-events-none
                  z-10
                "
              />
              {/* Logo */}
              <img
                src="/annam-logo.png"
                alt="Annam Logo"
                className="h-10 w-auto md:h-14"
              />
            </div>

            <div className="flex-1 md:flex justify-center min-w-0 hidden ">
              <TabsList className="flex gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0 no-scrollbar">
                {user && user.role !== "expert" && (
                  <TabsTrigger
                    value="performance"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>Dashboard</span>
                      {/* <span>Performance</span> */}
                    </HoverCard>
                  </TabsTrigger>
                )}
                {user && user.role === "expert" && (
                  <TabsTrigger
                    value="expertPerformance"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>Dashboard</span>
                      {/* <span>Performance</span> */}
                    </HoverCard>
                  </TabsTrigger>
                )}

                {user && user.role == "expert" && (
                  <TabsTrigger
                    value="questions"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <span>Questions</span>
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="all_questions"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <span>All Questions</span>
                </TabsTrigger>

                {user && user.role !== "expert" && (
                  <TabsTrigger
                    value="user_management"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>Expert Management</span>
                    </HoverCard>
                  </TabsTrigger>
                )}

                {user && user.role !== "expert" && (
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
                    <span>Agents Interface</span>
                  </HoverCard>
                </TabsTrigger>

                {user && (
                  <TabsTrigger
                    value="history"
                    className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>History</span>
                    </HoverCard>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* RIGHT SIDE ICONS */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Notifications */}
              <button
                onClick={() => navigate({ to: "/notifications" })}
                className="relative p-1 rounded-md hover:bg-accent transition-colors"
              >
                <BellIcon className="w-5 h-5 text-muted-foreground hover:text-foreground transition" />
                {user?.notifications! > 0 && (
                  <span className="absolute -top-[4px] -right-[12px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">
                    {user?.notifications! > 99 ? "99+" : user?.notifications}
                  </span>
                )}
              </button>

              <ThemeToggleCompact />

              <UserProfileActions />

              <MobileSidebar user={user!} setTab={setActiveTab} />
            </div>
          </div>
        </header>

        <div className=" h-full py-6 min-w-0">
          <div className="grid h-full items-stretch gap-6 min-w-0">
            <div className="md:order-1 w-full min-w-0">
              {user && user.role !== "expert" && (
                <TabsContent value="performance" className="mt-0 border-0 p-0 ">
                  {/* <PerformanceMatrics /> */}
                  <Dashboard />
                </TabsContent>
              )}
              {user && user.role === "expert" && (
                <TabsContent
                  value="expertPerformance"
                  className="mt-0 border-0 p-0 "
                >
                  {/* <PerformanceMatrics /> */}
                  <ExpertDashboard />
                </TabsContent>
              )}
              {user && user.role == "expert" && (
                <TabsContent value="questions" className="mt-0 border-0 p-0 ">
                  <QAInterface
                    autoSelectQuestionId={selectedQuestionId}
                    onManualSelect={setSelectedQuestionId}
                    selectQuestionType={selectedQuestionType}
                  />
                </TabsContent>
              )}
              <TabsContent
                value="all_questions"
                className="mt-0 border-0 md:px-8 "
              >
                <QuestionsPage
                  currentUser={user!}
                  autoOpenQuestionId={selectedCommentId || selectedQuestionId}
                />
              </TabsContent>

              {user && user.role !== "expert" && (
                <TabsContent
                  value="user_management"
                  className="mt-0 border-0 p-0 "
                >
                  <UserManagement />
                </TabsContent>
              )}
              {user && user.role !== "expert" && (
                <TabsContent
                  value="request_queue"
                  className="mt-0 border-0 md:px-8 px-2 w-full "
                >
                  <RequestsPage autoSelectId={selectedRequestId} />
                </TabsContent>
              )}
              <TabsContent value="upload" className="mt-0 border-0 p-0 ">
                <div className=" overflow-hidden bg-background p-4 ps-0">
                  <div className=" mx-auto py-8 pt-0">
                    <VoiceRecorderCard />
                  </div>
                </div>
              </TabsContent>
              {user && (
                <TabsContent
                  value="history"
                  className="mt-0 border-0 p-0 max-w-[98%]"
                >
                  <FullSubmissionHistory
                    currentUser={user!}
                    selectedHistoryId={selectedHistoryId}
                  />
                </TabsContent>
              )}
            </div>
          </div>
        </div>
      </Tabs>
    </>
  );
};
