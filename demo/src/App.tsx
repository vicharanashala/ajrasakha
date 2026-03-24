import React, { useEffect, useRef, useState } from "react";
import {
  Menu,
  SquarePen,
  ArrowUp,
  Lightbulb,
  Volume2,
  Copy,
  PencilLine,
  Network,
  ThumbsUp,
  ThumbsDown,
  RefreshCcw,
  Share2,
  Sun,
  Moon,
  MoreHorizontal,
  ArrowUpRight,
  Check,
  ChevronDown,
  ArrowDown,
  Loader2,
} from "lucide-react";
import chatData from "./data/index.json";

type Role = "user" | "bot";
interface SourceItem {
  name: string;
  url: string;
}

interface ThoughtStep {
  action: string;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  thoughts?: string;
  thoughtSteps?: ThoughtStep[];
  thoughtSummary?: string;
  stages?: string[];
  currentStage?: number;
  isLoading?: boolean;
  reviewerName?: string[];
  sources?: SourceItem[];
}

interface ChatHistoryItem {
  id: string;
  title: string;
  date: string;
}

interface HistoryChatRecord extends ChatHistoryItem {
  messages: Message[];
}

interface SuggestionRecord {
  prompt: string;
  reply: string;
  reviewerName?: string[];
  sources?: SourceItem[];
  thoughtSteps: ThoughtStep[];
  thoughtSummary: string;
}

const suggestionData = (chatData.suggestions ?? []) as SuggestionRecord[];
const initialHistoryData = (chatData.history ?? []) as HistoryChatRecord[];
const initialHistory: ChatHistoryItem[] = initialHistoryData.map(
  ({ id, title, date }) => ({
    id,
    title,
    date,
  }),
);
const initialSavedChats = initialHistoryData.reduce<Record<string, Message[]>>(
  (acc, chat) => {
    acc[chat.id] = chat.messages;
    return acc;
  },
  {},
);

const SUGGESTIONS = suggestionData.map(({ prompt }) => prompt);
const SUGGESTION_RESPONSES = suggestionData.reduce<
  Record<string, Omit<SuggestionRecord, "prompt">>
>((acc, { prompt, ...suggestion }) => {
  acc[prompt] = suggestion;
  return acc;
}, {});

const BrandIcon = ({ className = "w-6 h-6 text-[#10a37f]" }) => (
  <div
    className={`relative flex items-center justify-center rounded-full p-0.5 ${className}`}
  >
    <img
      src="/logo.png"
      alt="AjraSakha Logo"
      className="h-full w-full object-contain"
    />
  </div>
);

const formatMessageContent = (content: string) => {
  const withSections = content
    .replace(/\s+/g, " ")
    .replace(
      /([a-z0-9.)])\s+([A-Z][A-Za-z][A-Za-z\s]{2,40}:)/g,
      "$1\n\n$2",
    )
    .trim();

  const paragraphs = withSections
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs;
  }

  if (content.length < 280) {
    return [content.trim()];
  }

  const sentences = content.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [content];
  const groupedParagraphs: string[] = [];

  for (let i = 0; i < sentences.length; i += 2) {
    groupedParagraphs.push(sentences.slice(i, i + 2).join(" ").trim());
  }

  return groupedParagraphs;
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [newChatKey, setNewChatKey] = useState(Date.now());
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>(initialHistory);
  const [savedChats, setSavedChats] =
    useState<Record<string, Message[]>>(initialSavedChats);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingTimeoutsRef = useRef<number[]>([]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const updateScrollIndicator = () => {
    const container = chatScrollRef.current;
    if (!container) {
      setShowScrollToBottom(false);
      return;
    }

    const hasOverflow = container.scrollHeight - container.clientHeight > 24;
    const isNearBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 24;

    setShowScrollToBottom(hasOverflow && !isNearBottom);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const container = chatScrollRef.current;

    if (!container || messages.length === 0) {
      setShowScrollToBottom(false);
      return;
    }

    const handleScroll = () => updateScrollIndicator();

    updateScrollIndicator();
    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [messages]);

  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
    };
  }, []);

  const loadChat = (id: string) => {
    setActiveChatId(id);
    setMessages(savedChats[id] ?? []);

    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = (e?: React.FormEvent, textOverride?: string) => {
    if (e) e.preventDefault();
    const text = textOverride || inputValue.trim();
    if (!text) return;

    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setInputValue("");

    let currentChatId = activeChatId;

    if (!currentChatId) {
      currentChatId = `chat-${Date.now()}`;
      setActiveChatId(currentChatId);

      const newHistoryItem: ChatHistoryItem = {
        id: currentChatId,
        title: text.length > 25 ? `${text.substring(0, 25)}...` : text,
        date: "Today",
      };

      setChatHistory((prev) => [newHistoryItem, ...prev]);
    }

    let thoughtSteps: ThoughtStep[] = [];
    let thoughtSummary = "";
    let botResponse = "";
    let reviewerName: string[] = [];
    let sources: SourceItem[] = [];

    const matchedSuggestion = SUGGESTION_RESPONSES[text];

    if (matchedSuggestion) {
      botResponse = matchedSuggestion.reply;
      thoughtSteps = matchedSuggestion.thoughtSteps;
      thoughtSummary = matchedSuggestion.thoughtSummary;
      reviewerName = matchedSuggestion.reviewerName || [];
      sources = matchedSuggestion.sources || [];
    } else if (text.toLowerCase().includes("hi") || text.toLowerCase().includes("hello")) {
      botResponse =
        "Hello! How can I assist you today? I'm here to help with agriculture-related queries in India. Whether it's about crops, soil, pests, or farming techniques, feel free to ask.";
      thoughtSteps = [
        { action: "identify_greeting_intent" },
        { action: "fetch_agricultural_persona" },
      ];
      thoughtSummary = "Now let me introduce myself:";
    } else {
      botResponse =
        "I understand you're asking about farming. To give you the most accurate advice, could you provide a bit more detail? For example, your crop type, soil condition, or specific symptoms if you're asking about a disease.";
      thoughtSteps = [
        { action: "upload_question_to_reviewer_system" },
        { action: "get_context_from_reviewer_dataset" },
        { action: "get_context_from_golden_dataset" },
        { action: "get_context_from_package_of_practices" },
      ];
      thoughtSummary = "Now let me search for relevant FAQ videos:";
    }

    const loadingMessageId = `${Date.now()}-loading`;
    const loadingBotMsg: Message = {
      id: loadingMessageId,
      role: "bot",
      content: "",
      thoughtSteps,
      currentStage: 0,
      isLoading: true,
      reviewerName,
      sources,
    };

    const messagesWithLoader = [...newMessages, loadingBotMsg];

    setMessages(messagesWithLoader);
    setSavedChats((prev) => ({
      ...prev,
      [currentChatId]: messagesWithLoader,
    }));

    thoughtSteps.forEach((_, index) => {
      const stepTimeout = window.setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingMessageId ? { ...msg, currentStage: index + 1 } : msg,
          ),
        );
      }, (index + 1) * 900);

      pendingTimeoutsRef.current.push(stepTimeout);
    });

    const responseTimeout = window.setTimeout(() => {
      setMessages((prev) => {
        const updatedMsgs = prev.map((msg) =>
          msg.id === loadingMessageId
            ? {
                ...msg,
                content: botResponse,
                thoughtSummary,
                isLoading: false,
                reviewerName,
                sources,
              }
            : msg,
        );

        setSavedChats((sc) => ({
          ...sc,
          [currentChatId]: updatedMsgs,
        }));

        return updatedMsgs;
      });
    }, (thoughtSteps.length + 1) * 900);

    pendingTimeoutsRef.current.push(responseTimeout);
  };

  const startNewChat = () => {
    setMessages([]);
    setActiveChatId(null);
    setNewChatKey(Date.now());
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const groupedHistory = chatHistory.reduce(
    (acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    },
    {} as Record<string, ChatHistoryItem[]>,
  );
  const shouldShowInput = false;
  const shouldShowSuggestions = messages.length === 0;

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="flex h-screen w-full overflow-hidden bg-white font-sans text-gray-800 transition-colors duration-200 dark:bg-[#212121] dark:text-gray-200">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 transition-opacity dark:bg-black/60 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed z-40 flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-[#f9f9f9] transition-all duration-300 ease-in-out dark:border-[#2f2f2f] dark:bg-[#171717] md:relative ${
            isSidebarOpen
              ? "ml-0 translate-x-0"
              : "-translate-x-full md:-ml-64 md:translate-x-0"
          }`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between bg-[#f9f9f9] p-3 dark:bg-[#171717]">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#2f2f2f]"
              title="Close sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={startNewChat}
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#2f2f2f]"
              title="New Chat"
            >
              <SquarePen className="h-5 w-5" />
            </button>
          </div>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-3">
            {Object.entries(groupedHistory).map(([date, items]) => (
              <div key={date}>
                <h3 className="mb-2 px-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {date}
                </h3>
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadChat(item.id)}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-gray-200 dark:hover:bg-[#2f2f2f] ${
                        activeChatId === item.id ? "bg-gray-200 dark:bg-[#2f2f2f]" : ""
                      }`}
                    >
                      <BrandIcon className="h-7 w-7 shrink-0" />
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                        {item.title}
                      </span>
                      {activeChatId === item.id && (
                        <MoreHorizontal className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto border-t border-gray-200 p-3 dark:border-[#2f2f2f]">
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-200 dark:hover:bg-[#2f2f2f]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-sm font-semibold text-white">
                DM
              </div>
              <span className="flex-1 truncate text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Demo
              </span>
            </button>
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-transparent px-4">
            <div className="flex items-center gap-2">
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="-ml-2 rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[#2f2f2f]"
                  title="Open sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-[#2f2f2f]"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              {messages.length > 0 && (
                <button className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-[#2f2f2f]">
                  <Share2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </header>

          {messages.length === 0 && <div className="flex-1" />}

          <div
            ref={chatScrollRef}
            className={
              messages.length === 0
                ? "w-full"
                : "custom-scrollbar relative flex-1 overflow-y-auto pb-6"
            }
          >
            {messages.length === 0 ? (
              <div key={newChatKey} className="mb-6 flex w-full flex-col items-center px-4">
                <div className="flex items-center justify-center gap-3 md:gap-4">
                  <BrandIcon className="mt-2 h-10 w-10 animate-logo-reveal opacity-0 md:h-12 md:w-12" />
                  <h1 className="flex text-center text-3xl font-semibold tracking-tight md:text-4xl">
                    {"Welcome to AjraSakha!".split("").map((char, idx) => (
                      <span
                        key={idx}
                        className="inline-block animate-text-reveal-seq opacity-0"
                        style={{ animationDelay: `${idx * 0.04}s` }}
                      >
                        {char === " " ? "\u00A0" : char}
                      </span>
                    ))}
                  </h1>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="w-full">
                    {msg.role === "user" ? (
                      <div className="mb-4 flex items-start gap-4">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-xs font-semibold text-white">
                          DM
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="mb-1 text-[15px] font-semibold text-gray-800 dark:text-gray-100">
                            Demo
                          </h4>
                          <div className="whitespace-pre-wrap text-[15px] text-gray-800 dark:text-gray-200">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex items-start gap-4">
                        <BrandIcon className="mt-1 h-8 w-8 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <h4 className="mb-1 text-[15px] font-semibold text-gray-800 dark:text-gray-100">
                            AjraSakha
                          </h4>

                          {(msg.thoughtSteps || msg.thoughts) && (
                            <div className="mb-4 mt-2">
                              {!msg.isLoading && (
                                <button
                                  onClick={() => setShowThoughts(!showThoughts)}
                                  className="mb-4 flex items-center gap-2 text-[15px] text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                                >
                                  <Lightbulb className="h-4 w-4 text-gray-500" />
                                  Thoughts
                                </button>
                              )}

                              {(showThoughts || msg.isLoading) && (
                                <div className="relative space-y-4 border-l border-transparent pb-2 pl-4">
                                  {msg.thoughtSteps?.map((step, idx) => {
                                    if (
                                      msg.isLoading &&
                                      msg.currentStage !== undefined &&
                                      idx > msg.currentStage
                                    ) {
                                      return null;
                                    }

                                    const isLoadingStep =
                                      msg.isLoading && msg.currentStage === idx;

                                    return (
                                      <div
                                        key={idx}
                                        className={`group flex cursor-default items-center justify-between text-[14.5px] text-gray-700 dark:text-gray-300 ${isLoadingStep ? "animate-fade-in" : ""}`}
                                      >
                                        <div className="flex items-center gap-3">
                                          {isLoadingStep ? (
                                            <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center">
                                              <Loader2 className="h-4 w-4 animate-spin text-[#a855f7]" />
                                            </div>
                                          ) : (
                                            <div className="flex h-4.5 w-4.5  shrink-0 items-center justify-center rounded-full bg-[#a855f7]">
                                              <Check className="h-3 w-3 stroke-3 text-white" />
                                            </div>
                                          )}
                                          <span
                                            className={
                                              isLoadingStep ? "opacity-80 transition-opacity" : ""
                                            }
                                          >
                                            Ran {step.action}
                                          </span>
                                        </div>
                                        <ChevronDown
                                          className={`h-4 w-4 cursor-pointer text-gray-500 opacity-80 hover:text-gray-800 dark:hover:text-gray-200 ${isLoadingStep ? "hidden" : ""}`}
                                        />
                                      </div>
                                    );
                                  })}

                                  {msg.thoughtSummary && !msg.isLoading && (
                                    <div className="mt-5 animate-fade-in text-[14.5px] text-gray-700 dark:text-gray-300">
                                      {msg.thoughtSummary}
                                    </div>
                                  )}

                                  {msg.thoughts && !msg.thoughtSteps && !msg.isLoading && (
                                    <div className="mt-2 text-[14px] italic text-gray-500 dark:text-gray-400">
                                      {msg.thoughts}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.isLoading && msg.stages && !msg.thoughtSteps && (
                            <div className="mt-2 space-y-2">
                              {msg.stages.map((stage, index) => {
                                const isComplete = index < (msg.currentStage ?? 0);
                                const isActive = index === (msg.currentStage ?? 0);

                                return (
                                  <div
                                    key={stage}
                                    className={`flex items-center gap-3 text-[14px] transition-all duration-300 ${
                                      isComplete
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : isActive
                                          ? "text-gray-800 dark:text-gray-100"
                                          : "text-gray-400 dark:text-gray-500"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-2.5 w-2.5 rounded-full ${
                                        isComplete
                                          ? "bg-emerald-500"
                                          : isActive
                                            ? "bg-[#10a37f] animate-pulse"
                                            : "bg-gray-300 dark:bg-gray-600"
                                      }`}
                                    />
                                    <span>{stage}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {!msg.isLoading && (
                            <div className="animate-fade-in space-y-3 text-[15px] leading-7 text-gray-800 dark:text-gray-200">
                              {formatMessageContent(msg.content).map((paragraph, index) => (
                                <p
                                  key={`${msg.id}-paragraph-${index}`}
                                  className={
                                    index === 0
                                      ? "whitespace-pre-wrap pl-4 text-gray-700 dark:text-gray-300"
                                      : "whitespace-pre-wrap pl-4 text-gray-700 dark:text-gray-300"
                                  }
                                >
                                  {paragraph}
                                </p>
                              ))}
                            </div>
                          )}
                          {/* ========================= */}
{/* ✅ NEW: REVIEWER + SOURCE TABLE */}
{/* ========================= */}
{!msg.isLoading && (msg.reviewerName || msg.sources?.length) && (
  <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2f2f2f] dark:bg-[#1e1e1e]">
    
    <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
      The answer I provided is sourced only from the following approved materials:
    </h3>

    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-[#2f2f2f]">
      
      {/* HEADER */}
      <div className="grid grid-cols-2 bg-gray-200 text-sm font-semibold dark:bg-[#2a2a2a]">
        <div className="p-2">Agri Specialist Name</div>
        <div className="p-2">Source Link</div>
      </div>

      {/* CONTENT */}
      <div className="grid grid-cols-2 text-sm">
        
        {/* Reviewer */}
        <div className="p-2 border-t dark:border-[#2f2f2f]">
          {msg.reviewerName && msg.reviewerName.length > 0
  ? msg.reviewerName.join(", ")
  : "-"}
        </div>

        {/* Sources */}
        <div className="p-2 border-t dark:border-[#2f2f2f] flex flex-wrap gap-2">
          
          {msg.sources && msg.sources.length > 0 ? (
            msg.sources.map((src, i) => (
              <a
                key={i}
                href={src.url}                 // ✅ LINK
                target="_blank"               // ✅ NEW TAB
                rel="noopener noreferrer"     // ✅ SECURITY BEST PRACTICE
                className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
              >
                {src.name}
              </a>
            ))
          ) : (
            "-"
          )}

        </div>
      </div>
    </div>
  </div>
)}
                          <div className="mt-3 flex items-center gap-1">
                            {[
                              Volume2,
                              Copy,
                              PencilLine,
                              Network,
                              ThumbsUp,
                              ThumbsDown,
                              RefreshCcw,
                            ].map((Icon, i) => (
                              <button
                                key={i}
                                disabled={msg.isLoading}
                                className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#2f2f2f] dark:hover:text-gray-300"
                              >
                                <Icon className="h-4 w-4" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
                <div className="pointer-events-none sticky bottom-3 left-0 z-20 flex justify-center">
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                    className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-lg backdrop-blur-sm transition-all duration-300 dark:border-gray-700 dark:bg-[#2f2f2f]/95 dark:text-gray-200 ${
                      showScrollToBottom
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-3 opacity-0"
                    }`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {shouldShowInput && (
            <div
              className={`w-full px-4 pt-2 pb-4 ${
                messages.length === 0
                  ? "bg-transparent"
                  : "bg-linear-to-t from-white via-white to-transparent dark:from-[#212121] dark:via-[#212121] dark:to-transparent"
              }`}
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
                <div className="relative w-full rounded-3xl border border-gray-300 bg-white shadow-sm transition-shadow hover:shadow-md focus-within:border-gray-400 focus-within:shadow-md dark:border-transparent dark:bg-[#2f2f2f] dark:focus-within:border-[#444]">
                  <form onSubmit={handleSendMessage} className="flex w-full flex-col">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Message AjraSakha"
                      className="m-0 max-h-48 w-full resize-none overflow-y-auto bg-transparent px-4 pt-4 pb-2 leading-relaxed text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                      rows={1}
                      style={{ minHeight: "52px" }}
                    />

                    <div className="flex items-center justify-between px-3 pb-3">
                      <div className="flex items-center gap-1" />

                      <div className="flex items-center gap-1">
                        <button
                          type="submit"
                          disabled={!inputValue.trim()}
                          className={`ml-1 rounded-full p-1.5 transition-colors ${
                            inputValue.trim()
                              ? "bg-black text-white hover:opacity-80 dark:bg-white dark:text-black"
                              : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-[#444] dark:text-gray-500"
                          }`}
                        >
                          <ArrowUp className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

              </div>
            </div>
          )}

          {shouldShowSuggestions && (
            <div className="w-full px-4 pb-4">
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
                <div className="mt-4 flex w-full flex-col gap-3">
                  <div className="flex w-full flex-col items-start">
                    {SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(undefined, suggestion)}
                        className="group flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2.5 text-left text-[14px] text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 dark:text-[#a0a0a0] dark:hover:bg-[#2f2f2f] dark:hover:text-gray-200"
                      >
                        <span>{suggestion}</span>
                        <ArrowUpRight className="h-4 w-4 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-[#666]" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.length === 0 && <div className="flex-[1.2]" />}

          <div className="w-full px-4 pb-3">
            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-4 text-xs text-gray-400">
              <a href="#" className="hover:text-gray-600 hover:underline dark:hover:text-gray-300">
                annam.ai
              </a>
              <span className="hidden sm:inline">|</span>
              <a href="#" className="hover:text-gray-600 hover:underline dark:hover:text-gray-300">
                Privacy policy
              </a>
              <span className="hidden sm:inline">|</span>
              <a href="#" className="hover:text-gray-600 hover:underline dark:hover:text-gray-300">
                Terms of service
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
