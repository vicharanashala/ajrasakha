import type { IUser } from "@/types";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Clock,
  Database,
  History,
  List,
  Menu,
  MessageSquare,
  Phone,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { isCoordinatorRole } from "@/lib/roles";
import { Sheet, SheetContent, SheetTrigger } from "./atoms/sheet";

const SidebarButton = ({
  label,
  icon: Icon,
  onClick,
  isActive = false,
}: {
  label: string;
  icon: any;
  onClick: () => void;
  isActive?: boolean;
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        group w-full px-4 py-3 
        flex items-center gap-3
        text-left rounded-lg 
        transition-all duration-200 
        ${
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground hover:bg-accent hover:text-accent-foreground"
        }
        active:scale-[0.98]
      `}
    >
      <Icon
        className={`w-5 h-5 flex-shrink-0 ${
          isActive ? "" : "text-muted-foreground group-hover:text-foreground"
        }`}
      />
      <span className="font-medium">{label}</span>
    </button>
  );
};

export const MobileSidebar = ({
  user,
  setTab,
  setChatbotSource,
}: {
  user: IUser;
  setTab: (value: string) => void;
  setChatbotSource: (value: "whatsapp" | "annam" | "acc") => void;
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(
    user?.role === "call_agent" ? "call_interface" : user?.role !== "expert" ? "performance" : "questions"
  );
  const isCoordinator = isCoordinatorRole(user?.role);
  const handleClick = (value: string) => {
    if (value === "chatbotanalytics") {
      setTab("chatbotanalytics");
      setActiveTab(value);
    } else if (value === "whatsapp_history") {
      navigate({ to: "/whatsapp-history" });
    } else {
      setTab(value);
      setActiveTab(value);
    }

    setOpen(false);
  };

  const menuItems = [
    ...(user && user.role !== "expert" && user.role !== "call_agent"
      ? [{ id: "performance", label: "Dashboard", icon: BarChart3 }]
      : []),

    ...(user && user.role === "expert"
      ? [{ id: "expertPerformance", label: "Dashboard", icon: BarChart3 }]
      : []),

    ...(user && user.role === "expert"
      ? [{ id: "questions", label: "Questions", icon: MessageSquare }]
      : []),

    ...(user && user.role !== "call_agent"
      ? [{ id: "all_questions", label: "All Questions", icon: List }]
      : []),

    ...(user && user.role !== "expert" && user.role !== "call_agent"
      ? [
          {
            id: "user_management",
            label:
              user.role === "admin" ? "User Management" : "Expert Management",
            icon: Users,
          },
        ]
      : []),

    ...(user && user.role !== "expert" && user.role !== "call_agent"
      ? [{ id: "request_queue", label: "Flags Reported", icon: AlertTriangle }]
      : []),

    ...(user && user.role !== "call_agent"
      ? [{ id: "upload", label: "Agents Interface", icon: Upload }]
      : []),

    ...(user && user.role === "call_agent"
      ? [
          { id: "call_dashboard", label: "Call Dashboard", icon: TrendingUp },
          { id: "call_interface", label: "Call Interface", icon: Phone },
          ...(user.isCallAgentActive
            ? [{ id: "call_history", label: "Call History", icon: Clock }]
            : []),
        ]
      : []),

    ...(user && user.role !== "expert" && user.role !== "call_agent"
      ? [
          {
            id: "chatbotanalytics",
            label: "Chatbot Analytics",
            icon: Bot,
          },
        ]
      : []),

    ...(user && user.role === "admin"
      ? [{ id: "data_processing", label: "Data Processing", icon: Database }]
      : []),

    ...(user && !isCoordinator && user.role !== "call_agent"
      ? [{ id: "history", label: "History", icon: History }]
      : []),
    ...(user && !isCoordinator && user.role !== "call_agent"
      ? [
          {
            id: "whatsapp_history",
            label: "WhatsApp History",
            icon: MessageSquare,
          },
        ]
      : []),
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="md:hidden">
        <div className="p-2 rounded-lg hover:bg-accent transition-colors">
          <Menu className="w-6 h-6" />
        </div>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="
          fixed left-0 top-0 h-full
          w-80 p-0 flex flex-col  pt-0
          bg-background border-r 
          shadow-2xl
          animate-in slide-in-from-left duration-300
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="logo"
              className="h-10 w-10 object-contain"
            />
            <div>
              <h2 className="font-semibold text-lg">Review System</h2>
              <p className="text-xs text-muted-foreground">Ajrasakha</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto ">
          {menuItems.map((item) => (
            <SidebarButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              onClick={() => handleClick(item.id)}
              isActive={ item.id === activeTab }
            />
          ))}
        </nav>

        {/* Footer */}
        {/* <div className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Version 1.0.0</span>
            <span className="px-2 py-1 bg-green-500/10 text-green-600 rounded-full font-medium">
              Live
            </span>
          </div>
        </div> */}
      </SheetContent>
    </Sheet>
  );
};
