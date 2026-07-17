import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Input } from "@/components/atoms/input";
import {
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Eye,
  ArrowRight,
  MessageSquare,
  User,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TrackingStep {
  label: string;
  status: "completed" | "active" | "pending";
  timestamp?: Date;
  icon: React.ReactNode;
}

interface QuestionTracking {
  id: string;
  questionText: string;
  category: string;
  farmerName: string;
  farmerLocation: string;
  status: "submitted" | "under_review" | "answered" | "delivered" | "feedback_given";
  submittedAt: Date;
  reviewedAt?: Date;
  answeredAt?: Date;
  deliveredAt?: Date;
  feedbackAt?: Date;
  assignedExpert?: string;
  upvotes: number;
  language: string;
}

const MOCK_TRACKING: QuestionTracking[] = [
  {
    id: "q_t1",
    questionText: "What is the best time to sow wheat in Rajasthan?",
    category: "crop_advice",
    farmerName: "Ramesh Kumar",
    farmerLocation: "Jaipur, Rajasthan",
    status: "answered",
    submittedAt: new Date(Date.now() - 7200000),
    reviewedAt: new Date(Date.now() - 5400000),
    answeredAt: new Date(Date.now() - 3600000),
    assignedExpert: "Dr. Priya Patel",
    upvotes: 5,
    language: "Hindi",
  },
  {
    id: "q_t2",
    questionText: "How to manage waterlogging in paddy fields?",
    category: "irrigation",
    farmerName: "Anil Singh",
    farmerLocation: "Patna, Bihar",
    status: "under_review",
    submittedAt: new Date(Date.now() - 10800000),
    reviewedAt: new Date(Date.now() - 7200000),
    assignedExpert: "Prof. Rajesh Sharma",
    upvotes: 2,
    language: "Hindi",
  },
  {
    id: "q_t3",
    questionText: "Current price of tomato in Kurnool market?",
    category: "market_price",
    farmerName: "Lakshmi Devi",
    farmerLocation: "Kurnool, Andhra Pradesh",
    status: "delivered",
    submittedAt: new Date(Date.now() - 14400000),
    reviewedAt: new Date(Date.now() - 12600000),
    answeredAt: new Date(Date.now() - 10800000),
    deliveredAt: new Date(Date.now() - 9000000),
    assignedExpert: "Dr. Anita Kumar",
    upvotes: 12,
    language: "Telugu",
  },
  {
    id: "q_t4",
    questionText: "How to apply for PM-KISAN scheme?",
    category: "govt_scheme",
    farmerName: "Mohan Patel",
    farmerLocation: "Indore, Madhya Pradesh",
    status: "submitted",
    submittedAt: new Date(Date.now() - 1800000),
    upvotes: 0,
    language: "Hindi",
  },
  {
    id: "q_t5",
    questionText: "Neem oil spray ratio for cotton bollworm?",
    category: "pest_control",
    farmerName: "Suresh Reddy",
    farmerLocation: "Warangal, Telangana",
    status: "feedback_given",
    submittedAt: new Date(Date.now() - 86400000),
    reviewedAt: new Date(Date.now() - 82800000),
    answeredAt: new Date(Date.now() - 79200000),
    deliveredAt: new Date(Date.now() - 75600000),
    feedbackAt: new Date(Date.now() - 72000000),
    assignedExpert: "Dr. Suresh Reddy",
    upvotes: 8,
    language: "Telugu",
  },
  {
    id: "q_t6",
    questionText: "Soil test for red soil in Anantapur?",
    category: "soil_health",
    farmerName: "Krishnaiah",
    farmerLocation: "Anantapur, Andhra Pradesh",
    status: "answered",
    submittedAt: new Date(Date.now() - 43200000),
    reviewedAt: new Date(Date.now() - 39600000),
    answeredAt: new Date(Date.now() - 36000000),
    assignedExpert: "Prof. Deepa Nair",
    upvotes: 3,
    language: "Telugu",
  },
  {
    id: "q_t7",
    questionText: "Which variety of rice is drought resistant?",
    category: "crop_advice",
    farmerName: "Gopal Krishna",
    farmerLocation: "Bhubaneswar, Odisha",
    status: "under_review",
    submittedAt: new Date(Date.now() - 5400000),
    upvotes: 1,
    language: "Odia",
  },
  {
    id: "q_t8",
    questionText: "How to set up drip irrigation for mango orchard?",
    category: "irrigation",
    farmerName: "Vijay Kumar",
    farmerLocation: "Ratnagiri, Maharashtra",
    status: "delivered",
    submittedAt: new Date(Date.now() - 172800000),
    reviewedAt: new Date(Date.now() - 169200000),
    answeredAt: new Date(Date.now() - 165600000),
    deliveredAt: new Date(Date.now() - 162000000),
    assignedExpert: "Dr. Arjun Mehta",
    upvotes: 15,
    language: "Marathi",
  },
];

const STATUS_CONFIG = {
  submitted: { color: "bg-blue-500", label: "Submitted", icon: <Send className="w-4 h-4" /> },
  under_review: { color: "bg-amber-500", label: "Under Review", icon: <Eye className="w-4 h-4" /> },
  answered: { color: "bg-emerald-500", label: "Answered", icon: <CheckCircle2 className="w-4 h-4" /> },
  delivered: { color: "bg-purple-500", label: "Delivered", icon: <CheckCircle2 className="w-4 h-4" /> },
  feedback_given: { color: "bg-primary", label: "Feedback Given", icon: <CheckCircle2 className="w-4 h-4" /> },
};

function getSteps(tracking: QuestionTracking): TrackingStep[] {
  const steps: TrackingStep[] = [
    { label: "Submitted", status: "completed", timestamp: tracking.submittedAt, icon: <Send className="w-4 h-4" /> },
    { label: "Under Review", status: "pending", icon: <Eye className="w-4 h-4" /> },
    { label: "Answered", status: "pending", icon: <MessageSquare className="w-4 h-4" /> },
    { label: "Delivered", status: "pending", icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: "Feedback", status: "pending", icon: <CheckCircle2 className="w-4 h-4" /> },
  ];

  const statusIndex: Record<string, number> = {
    submitted: 0,
    under_review: 1,
    answered: 2,
    delivered: 3,
    feedback_given: 4,
  };

  const currentIdx = statusIndex[tracking.status];

  steps.forEach((step, idx) => {
    if (idx < currentIdx) step.status = "completed";
    else if (idx === currentIdx) step.status = "active";
  });

  if (tracking.reviewedAt) steps[1].timestamp = tracking.reviewedAt;
  if (tracking.answeredAt) steps[2].timestamp = tracking.answeredAt;
  if (tracking.deliveredAt) steps[3].timestamp = tracking.deliveredAt;
  if (tracking.feedbackAt) steps[4].timestamp = tracking.feedbackAt;

  return steps;
}

function formatTime(date?: Date) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function QuestionTrackingPage() {
  const [tracking, setTracking] = useState<QuestionTracking[]>(MOCK_TRACKING);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    setTracking([...MOCK_TRACKING]);
    setIsRefreshing(false);
  };

  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = tracking.filter((t) => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!t.questionText.toLowerCase().includes(s) && !t.farmerName.toLowerCase().includes(s) && !t.id.toLowerCase().includes(s)) return false;
    }
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  const statusCounts = tracking.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((key) => (
          <Card
            key={key}
            className={`py-3 cursor-pointer transition-all ${
              filterStatus === key ? "ring-2 ring-primary" : "hover:bg-accent/30"
            }`}
            onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
          >
            <CardContent className="px-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${STATUS_CONFIG[key].color}/10 flex items-center justify-center`}>
                  <span className={`${STATUS_CONFIG[key].color} text-white p-1 rounded`}>{STATUS_CONFIG[key].icon}</span>
                </div>
                <div>
                  <p className="text-xl font-bold">{statusCounts[key] || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{STATUS_CONFIG[key].label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by question, farmer name, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tracking List */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const config = STATUS_CONFIG[item.status];
          const steps = getSteps(item);
          const isExpanded = expandedId === item.id;

          return (
            <div key={item.id} className="border border-border/60 rounded-xl bg-card/50 hover:bg-accent/20 transition-all overflow-hidden">
              {/* Question Header */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className="text-[10px] px-1.5 py-0.5 border border-border/60">{item.category.replace(/_/g, " ")}</Badge>
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${config.color} text-white border-0`}>{config.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{item.language}</span>
                    </div>
                    <p className="text-sm font-medium line-clamp-1">{item.questionText}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {item.farmerName}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.farmerLocation}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(item.submittedAt)}</span>
                      {item.upvotes > 0 && <span className="flex items-center gap-1">▲ {item.upvotes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.assignedExpert && (
                      <Badge variant="outline" className="text-[10px]">{item.assignedExpert}</Badge>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Expanded Progress Tracker */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border/40 pt-4">
                  {/* Progress Bar */}
                  <div className="relative flex items-center justify-between mb-6 px-2">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-muted" />
                    <div
                      className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all"
                      style={{
                        width: `${(steps.filter((s) => s.status === "completed").length / (steps.length - 1)) * 100}%`,
                      }}
                    />
                    {steps.map((step, idx) => (
                      <div key={idx} className="relative z-10 flex flex-col items-center gap-1">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                            step.status === "completed"
                              ? "bg-primary border-primary text-primary-foreground"
                              : step.status === "active"
                              ? "bg-primary/15 border-primary text-primary"
                              : "bg-muted border-border text-muted-foreground"
                          }`}
                        >
                          {step.icon}
                        </div>
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">{step.label}</span>
                        {step.timestamp && (
                          <span className="text-[8px] text-muted-foreground/70">{formatTime(step.timestamp)}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Detail Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-2 rounded-md bg-muted/50">
                      <p className="text-muted-foreground text-[10px]">Question ID</p>
                      <p className="font-mono font-medium">{item.id}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/50">
                      <p className="text-muted-foreground text-[10px]">Submitted</p>
                      <p className="font-medium">{formatDate(item.submittedAt)}</p>
                    </div>
                    {item.answeredAt && (
                      <div className="p-2 rounded-md bg-muted/50">
                        <p className="text-muted-foreground text-[10px]">Answered</p>
                        <p className="font-medium">{formatDate(item.answeredAt)}</p>
                      </div>
                    )}
                    {item.deliveredAt && (
                      <div className="p-2 rounded-md bg-muted/50">
                        <p className="text-muted-foreground text-[10px]">Delivered</p>
                        <p className="font-medium">{formatDate(item.deliveredAt)}</p>
                      </div>
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Timeline</p>
                    {steps.filter((s) => s.timestamp).map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-muted-foreground w-20 shrink-0">{step.label}</span>
                        <span>{formatDate(step.timestamp!)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No questions match your search</p>
        </div>
      )}
    </div>
  );
}
