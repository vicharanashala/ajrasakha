import {
  Tabs,
  TabsContent,
} from "@/components/atoms/tabs";
import { QAInterface } from "../features/qa-interface-page/QA-interface";
// import { FullSubmissionHistory } from "./submission-history";
import { VoiceRecorderCard } from "./voice-recorder-card";
import { QuestionsPage } from "./questions-page";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
// import { RequestsPage } from "./request-page";
import { initializeNotifications } from "@/services/pushService";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { PlaygroundHeader } from "./PlaygroundHeader";
import { UserManagement } from "./user-management";
import { Dashboard } from "./dashboard";
import { ExpertDashboard } from "./ExpertDashboard";
import { GateKeeperAuditorDashboard } from "./GateKeeperAuditorDashboard";
import { NotificationModal } from "./NotificationModal";
import { AnnamDashboard_dev as AnnamDashboard } from "../features/chatbotDashboard/AnnamDashboard_dev";
import { cn } from "@/lib/utils";
import { canManageUsers } from "@/lib/roles";
import { CallInterface } from "./CallInterface";
import { CallHistory } from "./CallHistory";
import { ManageCallAgents } from "./ManageCallAgents";
import { env } from "@/config/env";
import { DataProcessingDashboard } from "../features/faq-pop/DataProcessingDashboard";
import { CallAgentDashboard } from "./CallAgentDashboard";
import { UserService } from "@/hooks/services/userService";

export const PlaygroundPage = () => {
  const { data: user } = useGetCurrentUser({});
  const navigate = useNavigate();
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
    setSelectedQuestionType,
  } = useSelectedQuestion();
  // Initialize from localStorage or default

  const [activeTab, setActiveTab] = useState<string>("all_questions");
  const [chatbotSource, setChatbotSource] = useState<
    "annam" | "whatsapp" | "acc"
  >("annam");
  useEffect(() => {
    const saved = localStorage.getItem("application-filter");

    if (
      saved === "annam" ||
      // saved === "vicharanashala" ||
      saved === "whatsapp" ||
      saved === "acc"
    ) {
      setChatbotSource(saved);
    }
  }, []);
  const getStorageKey = (user?: { email?: string }) => {
    if (!user?.email) return null;
    return `playground_active_tab_${user.email}`;
  };
  const explicitSelectionTab = selectedRequestId
    ? "request_queue"
    : selectedHistoryId
      ? "history"
      : selectedQuestionId
        ? user?.role === "expert"
          ? "questions"
          : "all_questions"
        : selectedCommentId
          ? "all_questions"
          : null;

  // Guards the default-tab effect so it initialises once per user (and re-runs only when
  // an explicit selection changes). react-query gives `user` a new identity on every
  // window-focus refetch and notification invalidation; without this the effect would
  // re-apply the default/selection tab each time and pull moderators out of an answer
  // they were editing.
  const tabInitialisedFor = useRef<string | null>(null);

  // Set default tab based on user role when user data loads
  useEffect(() => {
    if (!user) return;
    const storageKey = getStorageKey(user);
    if (!storageKey) return;

    const initKey = `${storageKey}|${explicitSelectionTab ?? ""}`;
    if (tabInitialisedFor.current === initKey) return;
    tabInitialisedFor.current = initKey;

    if (explicitSelectionTab) {
      setActiveTab(explicitSelectionTab);
      localStorage.setItem(storageKey, explicitSelectionTab);
      return;
    }
    const defaultTab =
      user.role === "expert"
        ? "questions"
        : user.role === "call_agent"
          ? "call_interface"
          : user.role === "gate_keeper" || user.role === "auditor"
            ? "roleDashboard"
            : "performance";

    // A tab saved before the role changed (or before roleDashboard existed) can point at
    // content this role no longer renders, leaving a blank page. Drop it in that case.
    const savedTab = localStorage.getItem(storageKey);
    const isGateKeeperOrAuditor =
      user.role === "gate_keeper" || user.role === "auditor";
    const savedTabValid =
      !!savedTab &&
      (isGateKeeperOrAuditor ? savedTab !== "performance" : savedTab !== "roleDashboard");

    if (savedTab && savedTabValid) {
      setActiveTab(savedTab);
    } else {
      setActiveTab(defaultTab);
      localStorage.setItem(storageKey, defaultTab);
    }
  }, [user?.role, user?.email, explicitSelectionTab]);

  // Heartbeat for Call Agents
  useEffect(() => {
    if (!user || user.role !== "call_agent" || !user.isCallAgentActive) return;

    const userService = new UserService();
    const sendHeartbeat = async () => {
      try {
        await userService.sendHeartbeat();
      } catch (err) {
        console.error("Failed to send heartbeat:", err);
      }
    };

    // Send immediately on mount or status change
    sendHeartbeat();

    // Send every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [user?.role, user?.isCallAgentActive]);

  // The selection this effect last navigated for. Navigation must happen only when the
  // selection itself changes — NOT when the `user` object merely gets a new identity
  // (react-query refetches it on window focus and whenever a notification action
  // invalidates ["user"]). Without this guard, switching browser tabs or reviewing an
  // answer re-ran the effect and yanked the moderator back to the question list,
  // discarding in-progress edits.
  const lastNavigatedSelection = useRef<string | null>(null);

  // Only update tab when there's a specific selection that requires navigation
  useEffect(() => {
    if (!user) return;

    const selectionKey = [
      selectedRequestId,
      selectedHistoryId,
      selectedQuestionId,
      selectedCommentId,
      selectedQuestionType,
    ].join("|");
    // Same selection as last time → this run was caused by something else (a user
    // refetch). Leave the current tab alone.
    if (lastNavigatedSelection.current === selectionKey) return;
    lastNavigatedSelection.current = selectionKey;

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
    // Depend on the primitive user fields actually used (role for the target tab, email
    // for the storage key) rather than the object, so a refetch that returns identical
    // data doesn't re-trigger navigation.
  }, [
    user?.role,
    user?.email,
    selectedQuestionId,
    selectedRequestId,
    selectedCommentId,
    selectedHistoryId,
    selectedQuestionType,
  ]);

  const handleTabChange = (value: string) => {
    if (!user) return;

    // ChatBot Analytics is now its own route rather than an in-page tab.
    if (value === "chatbotanalytics") {
      navigate({ to: "/chatbot" });
      return;
    }

    const storageKey = getStorageKey(user);
    if (!storageKey) return;
    setActiveTab(value);
    localStorage.setItem(storageKey, value);

    if (value !== "questions") {
      setSelectedQuestionId(null);
      setSelectedQuestionType(null);
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

  const hasInitializedNotifications = useRef(false);

  useEffect(() => {
    if (!user?._id) return;

    if (hasInitializedNotifications.current) return;

    hasInitializedNotifications.current = true;

    initializeNotifications();
  }, [user]);

  return (
    <>
      <Tabs
        key={user?.role}
        value={activeTab}
        onValueChange={handleTabChange}
        className="h-full w-full"
      >
        <PlaygroundHeader
          user={user}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          setTab={setActiveTab}
          setChatbotSource={setChatbotSource}
        />

        <div className=" h-full py-6 min-w-0">
          <div className="grid h-full items-stretch gap-6 min-w-0">
            <div className="md:order-1 w-full min-w-0">
              {user &&
                user.role !== "expert" &&
                user.role !== "call_agent" &&
                user.role !== "gate_keeper" &&
                user.role !== "auditor" && (
                <TabsContent
                  value="performance"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
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
                    "duration-500 ease-out",
                  )}
                >
                  {/* <PerformanceMatrics /> */}
                  <ExpertDashboard />
                </TabsContent>
              )}
              {user && (user.role === "gate_keeper" || user.role === "auditor") && (
                <TabsContent
                  value="roleDashboard"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <GateKeeperAuditorDashboard />
                </TabsContent>
              )}
              {user && user.role == "expert" && (
                <TabsContent
                  value="questions"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <QAInterface
                    autoSelectQuestionId={selectedQuestionId}
                    onManualSelect={setSelectedQuestionId}
                    selectQuestionType={selectedQuestionType}
                    onManualSelectQuestionType={setSelectedQuestionType}
                  />
                </TabsContent>
              )}
              {user && user.role !== "call_agent" && (
                <TabsContent
                  value="all_questions"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <QuestionsPage
                    currentUser={user!}
                    autoOpenQuestionId={selectedCommentId || selectedQuestionId}
                  />
                </TabsContent>
              )}
              {user && canManageUsers(user.role) && (
                <TabsContent
                  value="user_management"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <UserManagement currentUser={user} />
                </TabsContent>
              )}
              {/* {user && user.role !== "expert" && (
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
              )} */}
              {user && user.role !== "call_agent" && (
                <TabsContent
                  value="upload"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <div className=" overflow-hidden bg-background p-4 ps-0">
                    <div className=" mx-auto py-8 pt-0">
                      <VoiceRecorderCard />
                    </div>
                  </div>
                </TabsContent>
              )}

              {user?.role === "call_agent" && (
                <TabsContent
                  value="call_dashboard"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <CallAgentDashboard />
                </TabsContent>
              )}

              {user?.role === "call_agent" && (
                <TabsContent
                  value="call_interface"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <CallInterface />
                </TabsContent>
              )}
              {user?.role === "call_agent" && (
                <TabsContent
                  value="call_history"
                  className={cn(
                    "mt-0 border-0 md:px-8 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <div className="w-full max-w-full px-4 md:px-6 py-2">
                    <CallHistory onRedial={() => { }} />
                  </div>
                </TabsContent>
              )}

              {user && user.role === "admin" && (
                <TabsContent
                  value="data_processing"
                  className={cn(
                    "mt-0 border-0 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <DataProcessingDashboard />
                </TabsContent>
              )}

              {user?.role === "admin" && (
                <TabsContent
                  value="manage_agents"
                  className={cn(
                    "mt-0 border-0 outline-none",
                    "data-[state=active]:animate-in",
                    "data-[state=active]:fade-in-0",
                    "data-[state=active]:zoom-in-[0.98]",
                    "data-[state=active]:slide-in-from-bottom-3",
                    "duration-500 ease-out",
                  )}
                >
                  <ManageCallAgents />
                </TabsContent>
              )}
              {/* {user && (
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
              )} */}
            </div>
          </div>
        </div>
      </Tabs>
    </>
  );
};
