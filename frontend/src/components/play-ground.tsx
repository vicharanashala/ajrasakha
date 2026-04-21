import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { QAInterface } from "../features/qa-interface-page/QA-interface";
import { FullSubmissionHistory } from "./submission-history";
import { VoiceRecorderCard } from "./voice-recorder-card";
import { QuestionsPage } from "./questions-page";
import { BellIcon, ChevronDownIcon } from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { RequestsPage } from "./request-page";
import { initializeNotifications } from "@/services/pushService";
import { useEffect, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/atoms/dropdown-menu";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { MobileSidebar } from "./mobile-sidebar";
import { HoverCard } from "./atoms/hover-card";
import { UserManagement } from "./user-management";
import { Dashboard } from "./dashboard";
import { ExpertDashboard } from "./ExpertDashboard";
import { NotificationModal } from "./NotificationModal";
import { AnnamDashboard_dev as AnnamDashboard } from '../features/chatbotDashboard/AnnamDashboard_dev'
import { cn } from "@/lib/utils";
import AuditPage from "./AuditPage";

export const PlaygroundPage = () => {
  const { data: user } = useGetCurrentUser({});
  const userId = user?._id?.toString();
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
  // Initialize from localStorage or default

  const [activeTab, setActiveTab] = useState<string>("all_questions");
  const [chatbotSource, setChatbotSource] = useState<'vicharanashala' | 'annam'>('vicharanashala');
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
      if (user.role === "expert" && selectedQuestionType === "peer_review") {
        calculatedTab = "questions";
      }
      // For other cases with questions, check role
      else if (user.role === "expert") {
        calculatedTab = "questions";
      } else {
        calculatedTab = "all_questions";
      }
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
    selectedQuestionType
  ]);



  const handleTabChange = (value: string) => {
    if (!user) return;
    const storageKey = getStorageKey(user);
    if (!storageKey) return;
    setActiveTab(value);
    localStorage.setItem(storageKey, value);

    if (value !== "questions") {
      setSelectedQuestionId(null);
      setSelectedQuestionType(null)
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

      <Tabs
        key={user?.role}
        value={activeTab}
        onValueChange={handleTabChange}
        className="h-full w-full"
      >
        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex items-center justify-between gap-4 px-4 py-3">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
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
                      <span>{user.role === 'admin' ? 'User' : 'Expert'} Management</span>
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

                {user && user.role !== "expert" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0 flex items-center gap-1 ${activeTab === 'chatbotanalytics'
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                          }`}
                      >
                        ChatBot Analytics
                        <ChevronDownIcon className="w-3.5 h-3.5 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={() => { setChatbotSource('vicharanashala'); handleTabChange('chatbotanalytics'); }}
                        className={activeTab === 'chatbotanalytics' && chatbotSource === 'vicharanashala' ? 'bg-primary/10 text-primary font-medium' : ''}
                      >
                        Vicharanashala
                        {activeTab === 'chatbotanalytics' && chatbotSource === 'vicharanashala' && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => { setChatbotSource('annam'); handleTabChange('chatbotanalytics'); }}
                        className={activeTab === 'chatbotanalytics' && chatbotSource === 'annam' ? 'bg-primary/10 text-primary font-medium' : ''}
                      >
                        Annam
                        {activeTab === 'chatbotanalytics' && chatbotSource === 'annam' && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

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

                {user && user.role !== "expert" && user.role !== "admin" && (<TabsTrigger value="audit" className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0">View Audit</TabsTrigger>) }
              </TabsList>
            </div>

            {/* RIGHT SIDE ICONS */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Notifications */}
              <NotificationModal
                trigger={
                  <button className="relative p-1 rounded-md hover:bg-accent transition-colors">
                    <BellIcon className="w-5 h-5 text-muted-foreground hover:text-foreground transition" />
                    {user?.notifications! > 0 && (
                      <span className="absolute -top-[4px] -right-[12px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">
                        {user?.notifications! > 99 ? "99+" : user?.notifications}
                      </span>
                    )}
                  </button>
                }
              />

              <ThemeToggleCompact />

              <UserProfileActions />

              <MobileSidebar user={user!} setTab={setActiveTab} setChatbotSource={setChatbotSource} />
            </div>
          </div>
        </header>

        <div className=" h-full py-6 min-w-0">
          <div className="grid h-full items-stretch gap-6 min-w-0">
            <div className="md:order-1 w-full min-w-0">
              {user && user.role !== "expert" && (
                <TabsContent value="performance" className={cn(
                  "mt-0 border-0 md:px-8 outline-none",
                  "data-[state=active]:animate-in",
                  "data-[state=active]:fade-in-0",
                  "data-[state=active]:zoom-in-[0.98]",
                  "data-[state=active]:slide-in-from-bottom-3",
                  "duration-500 ease-out"
                )} >
                  {/* <PerformanceMatrics /> */}
                  <Dashboard />
                </TabsContent>
              )}
              {user && user.role === "expert" && (
                <TabsContent
                  value="expertPerformance"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out"
                  )}                >
                  {/* <PerformanceMatrics /> */}
                  <ExpertDashboard />
                </TabsContent>
              )}
              {user && user.role == "expert" && (
                <TabsContent value="questions" className={cn(
                  "mt-0 border-0 md:px-8 outline-none",
                  "data-[state=active]:animate-in",
                  "data-[state=active]:fade-in-0",
                  "data-[state=active]:zoom-in-[0.98]",
                  "data-[state=active]:slide-in-from-bottom-3",
                  "duration-500 ease-out"
                )}>
                  <QAInterface
                    autoSelectQuestionId={selectedQuestionId}
                    onManualSelect={setSelectedQuestionId}
                    selectQuestionType={selectedQuestionType}
                    onManualSelectQuestionType={setSelectedQuestionType}
                  />
                </TabsContent>
              )}
              <TabsContent
                value="all_questions"
                className={cn(
                  "mt-0 border-0 md:px-8 outline-none",
                  "data-[state=active]:animate-in",
                  "data-[state=active]:fade-in-0",
                  "data-[state=active]:zoom-in-[0.98]",
                  "data-[state=active]:slide-in-from-bottom-3",
                  "duration-500 ease-out"
                )}              >
                <QuestionsPage
                  currentUser={user!}
                  autoOpenQuestionId={selectedCommentId || selectedQuestionId}
                />
              </TabsContent>
              <TabsContent
                value="chatbotanalytics"
                className={cn(
                  "mt-0 border-0 md:px-8 outline-none",
                  "data-[state=active]:animate-in",
                  "data-[state=active]:fade-in-0",
                  "data-[state=active]:zoom-in-[0.98]",
                  "data-[state=active]:slide-in-from-bottom-3",
                  "duration-500 ease-out"
                )}              >
                <AnnamDashboard source={chatbotSource} />
              </TabsContent>

              {user && user.role !== "expert" && (
                <TabsContent
                  value="user_management"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out"
                  )}                >
                  <UserManagement currentUser={user} />
                </TabsContent>
              )}
              {user && user.role !== "expert" && (
                <TabsContent
                  value="request_queue"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out"
                  )}                >
                  <RequestsPage autoSelectId={selectedRequestId} />
                </TabsContent>
              )}
              <TabsContent value="upload" className={cn(
                "mt-0 border-0 md:px-8 outline-none",
                "data-[state=active]:animate-in",
                "data-[state=active]:fade-in-0",
                "data-[state=active]:zoom-in-[0.98]",
                "data-[state=active]:slide-in-from-bottom-3",
                "duration-500 ease-out"
              )}>
                <div className=" overflow-hidden bg-background p-4 ps-0">
                  <div className=" mx-auto py-8 pt-0">
                    <VoiceRecorderCard />
                  </div>
                </div>
              </TabsContent>
              {user && (
                <TabsContent
                  value="history"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out"
                  )}                >
                  <FullSubmissionHistory
                    currentUser={user!}
                    selectedHistoryId={selectedHistoryId}
                  />
                </TabsContent>
                
              )}

              {user && user.role !== "expert" && user.role !== "admin" && (
                <TabsContent
                  value="audit"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out"
                  )}                >
                  <AuditPage />
                </TabsContent>
              )}
            </div>
          </div>
        </div>
      </Tabs>
    </>
  );
};
