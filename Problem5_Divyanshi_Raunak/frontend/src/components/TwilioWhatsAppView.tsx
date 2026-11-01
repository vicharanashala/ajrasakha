import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { GdbEntry } from '../types';
import {
  Send,
  RotateCw,
  Search,
  BookOpen,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Zap,
  PhoneCall,
  Clock,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  ChevronRight,
  Layers,
  MessageSquare,
  Play,
  Check,
  AlertCircle
} from 'lucide-react';

export const TwilioWhatsAppView: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'presentation_lab' | 'ongoing_sessions' | 'cron_automation' | 'live_gateway'>('presentation_lab');

  // Status & Logs
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [twilioStatus, setTwilioStatus] = useState<{
    configured: boolean;
    account_sid_masked: string;
    whatsapp_number: string;
    total_outgoing: number;
    total_incoming: number;
    nudges_sent: number;
    gdb_sent: number;
  } | null>(null);

  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // GDB Knowledge Base for dropdowns & inquiries
  const [gdbEntries, setGdbEntries] = useState<GdbEntry[]>([]);
  const [selectedGdbId, setSelectedGdbId] = useState<string>('');
  const [gdbSearchTerm, setGdbSearchTerm] = useState('');

  // Ongoing Sessions state
  const [ongoingSessions, setOngoingSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isPushingAll, setIsPushingAll] = useState(false);

  // Presentation Simulation Lab State (No Twilio Needed)
  const [simStep, setSimStep] = useState<1 | 2 | 3 | 4>(1);
  const [labPhone, setLabPhone] = useState('+919876543210');
  const [labCrop, setLabCrop] = useState('Wheat');
  const [labState, setLabState] = useState('Punjab');
  const [labQuestion, setLabQuestion] = useState('गेहूं में पीला रतुआ (Yellow Rust) के लक्षण हैं, क्या छिड़काव करें?');
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [questionAnswerResult, setQuestionAnswerResult] = useState<any>(null);

  // Feedback State in Simulation Lab
  const [labRating, setLabRating] = useState<number>(1);
  const [labComment, setLabComment] = useState('सलाह बहुत उपयोगी रही, 3 दिन में पीले धब्बे रुक गए।');
  const [labRootCause, setLabRootCause] = useState('none');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Push & Notification state
  const [isPushingFeedback, setIsPushingFeedback] = useState(false);
  const [pushResult, setPushResult] = useState<any>(null);

  // Cron Run State
  const [cronStatus, setCronStatus] = useState<any>(null);
  const [isTriggeringCron, setIsTriggeringCron] = useState(false);
  const [cronExecutionResult, setCronExecutionResult] = useState<any>(null);

  // Live Twilio Gateway Tab States
  const [nudgePhone, setNudgePhone] = useState('+919876543210');
  const [nudgeCrop, setNudgeCrop] = useState('Wheat');
  const [customNudgeText, setCustomNudgeText] = useState('');
  const [isSendingNudge, setIsSendingNudge] = useState(false);
  const [nudgeResult, setNudgeResult] = useState<any>(null);

  const [gdbPhone, setGdbPhone] = useState('+919876543210');
  const [isSendingGdb, setIsSendingGdb] = useState(false);
  const [gdbResult, setGdbResult] = useState<any>(null);

  const [simFromPhone, setSimFromPhone] = useState('+919876543210');
  const [simMessageText, setSimMessageText] = useState('गेहूं में पीला रतुआ (Yellow Rust) के लक्षण हैं, क्या छिड़काव करें?');
  const [isSimulatingIncoming, setIsSimulatingIncoming] = useState(false);
  const [simWebhookResult, setSimWebhookResult] = useState<any>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Pre-set questions for convenient presentation across multiple crops
  const presetQuestions = [
    {
      crop: 'Mustard (सरसों)',
      label: 'Mustard: White Rust Fungicide (सरसों - सफेद रतुआ)',
      text: 'सरसों में सफेद रतुआ (व्हाइट रस्ट) रोग के लिए कौन सी दवा का छिड़काव करें?'
    },
    {
      crop: 'Paddy (धान)',
      label: 'Paddy: Khaira Disease / Zinc (धान - खैरा रोग)',
      text: 'धान में खैरा रोग (जिंक की कमी) का उपचार कैसे करें?'
    },
    {
      crop: 'Cotton (कपास)',
      label: 'Cotton: Pink Bollworm Control (कपास - गुलाबी सुंडी)',
      text: 'कपास में गुलाबी सुंडी (पिंक बोलवर्म) से बचाव के क्या उपाय हैं?'
    },
    {
      crop: 'Sugarcane (गन्ना)',
      label: 'Sugarcane: Early Weed Control (गन्ना - खरपतवार)',
      text: 'वसंतकालीन गन्ने में चौड़ी व संकरी पत्ती वाले खरपतवारों का नियंत्रण कैसे करें?'
    },
    {
      crop: 'Soybean (सोयाबीन)',
      label: 'Soybean: Girdle Beetle Attack (सोयाबीन - गर्डल बीटल)',
      text: 'सोयाबीन में चक्र भृंग (गर्डल बीटल) और सेमीलूपर सुंडी का नियंत्रण कैसे करें?'
    },
    {
      crop: 'Gram (चना)',
      label: 'Gram / Chickpea: Pod Borer (चना - फली छेदक)',
      text: 'चने में फली छेदक सुंडी (हेलिकोवर्पा) के नियंत्रण हेतु कौन सी दवा उपयोगी है?'
    },
    {
      crop: 'Wheat (गेहूँ)',
      label: 'Wheat: Critical CRI Irrigation (गेहूं - पहली सिंचाई)',
      text: 'गेहूं की फसल में पहली और सबसे जरूरी सिंचाई (CRI) कब करनी चाहिए?'
    },
    {
      crop: 'Wheat (गेहूँ)',
      label: 'Wheat: Aphids / Chepa Control (गेहूं - माहू कीट)',
      text: 'गेहूं में बालियां निकलते समय माहू (चेपा) कीट का नियंत्रण कैसे करें?'
    }
  ];

  const loadStatus = async () => {
    try {
      setIsLoadingStatus(true);
      const data = await api.getTwilioStatus();
      setTwilioStatus(data);
    } catch (err: any) {
      console.error('Failed to load Twilio status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const loadLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const data = await api.getTwilioLogs(30);
      setLogs(data);
    } catch (err: any) {
      console.error('Failed to load Twilio logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const loadGdbEntries = async () => {
    try {
      const res = await api.getGdbEntries({ limit: 50 });
      setGdbEntries(res.entries || []);
      if (res.entries?.length && !selectedGdbId) {
        setSelectedGdbId(res.entries[0]._id);
      }
    } catch (err) {
      console.error('Failed to load GDB entries:', err);
    }
  };

  const loadOngoingSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const data = await api.getOngoingSessions(50);
      setOngoingSessions(data);
    } catch (err: any) {
      console.error('Failed to load ongoing sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadCronStatus = async () => {
    try {
      const data = await api.getNudgeCronStatus();
      setCronStatus(data);
    } catch (err: any) {
      console.error('Failed to load cron status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
    loadLogs();
    loadGdbEntries();
    loadOngoingSessions();
    loadCronStatus();
  }, []);

  // --- Step 1: Farmer Asks Question (Creates/Updates Ongoing Session, Inquiry Alone is NOT Feedback) ---
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labQuestion.trim()) return;

    try {
      setIsAskingQuestion(true);
      setQuestionAnswerResult(null);
      setPushResult(null);

      const res = await api.askFarmerQuestion({
        phone_number: labPhone.trim(),
        question: labQuestion.trim(),
        crop: labCrop,
        farmer_state: labState
      });

      setQuestionAnswerResult(res);
      setCurrentSession(res.session);
      if (res.crop) {
        setLabCrop(res.crop);
      }

      // If the farmer already had an open session (new question during open session),
      // the backend will have updated it. Show appropriate feedback.
      const hadOpenSession = res.session?.question && res.session.question !== labQuestion.trim();
      if (hadOpenSession) {
        showToast('New question answered from GDB. Previous open session updated with new question context.', 'info');
      } else {
        showToast('Answer retrieved from GDB Knowledge Base! Ongoing inquiry session created in database.');
      }

      // Keep user on Step 1 to show the response answer first before asking for rating
      setSimStep(1);
      loadOngoingSessions();
      loadLogs();
    } catch (err: any) {
      showToast(`Question inquiry failed: ${err.message}`, 'error');
    } finally {
      setIsAskingQuestion(false);
    }
  };

  // --- Step 1 Immediate Rating: Farmer rates after viewing the answer ---
  const handleDirectRate = async (rating: number) => {
    try {
      setIsSubmittingFeedback(true);
      const res = await api.submitFarmerFeedback({
        phone_number: labPhone.trim(),
        session_id: currentSession?._id,
        rating: rating,
        feedback_comment: rating === 1 ? 'सलाह बहुत उपयोगी रही (Answer was helpful).' : 'सुधार की आवश्यकता है (Needs agronomic revision).'
      });
      setCurrentSession(res.session);
      showToast(
        rating === 1
          ? 'Farmer rated 👍 Yes (Helpful)! Rating pushed to GDB entry immediately.'
          : 'Farmer rated 👎 No (Unhelpful)! Rating pushed to GDB entry immediately.'
      );
      loadOngoingSessions();
      loadLogs();
      loadGdbEntries();
    } catch (err: any) {
      showToast(`Failed to record rating: ${err.message}`, 'error');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // --- Step 2: Evening Nudge Preview / Trigger ---
  const handleSimulateNudge = async () => {
    try {
      if (labPhone) {
        await api.sendTwilioNudge({
          phone_number: labPhone,
          crop: labCrop
        });
      }
      showToast('Agro-Chrono evening leisure nudge sent to farmer WhatsApp!');
      setSimStep(3);
      loadOngoingSessions();
      loadLogs();
    } catch (err: any) {
      showToast(`Nudge failed: ${err.message}`, 'error');
    }
  };

  const handleNudgeSession = async (session: any) => {
    try {
      await api.sendTwilioNudge({
        phone_number: session.phone_number,
        crop: session.crop || 'Wheat'
      });
      showToast(`Agro-Chrono evening leisure nudge dispatched to ${session.phone_number}!`);
      loadOngoingSessions();
      loadLogs();
    } catch (err: any) {
      showToast(`Nudge failed: ${err.message}`, 'error');
    }
  };

  // --- Step 3: Farmer Responds with Feedback ---
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingFeedback(true);
      const res = await api.submitFarmerFeedback({
        phone_number: labPhone.trim(),
        session_id: currentSession?._id,
        rating: labRating,
        feedback_comment: labComment,
        root_cause: labRating === 2 && labRootCause !== 'none' ? labRootCause : undefined
      });

      setCurrentSession(res.session);
      setSimStep(4);
      showToast('Farmer feedback recorded and rating pushed to GDB entry immediately!');
      loadOngoingSessions();
      loadLogs();
      loadGdbEntries();
    } catch (err: any) {
      showToast(`Failed to record feedback: ${err.message}`, 'error');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // --- Step 4A: Manual Push to GDB (Notifies Farmer via WhatsApp + Deletes Session from Ongoing Collection) ---
  const handleManualPush = async (sessionId?: string) => {
    const targetId = sessionId || currentSession?._id;
    if (!targetId) {
      showToast('No session selected to push', 'error');
      return;
    }

    try {
      setIsPushingFeedback(true);
      const res = await api.pushFeedbackToGdb(targetId);
      setPushResult(res);
      showToast(
        'Feedback pushed to GDB! Farmer notified via WhatsApp & ongoing session deleted from database.'
      );
      loadOngoingSessions();
      loadLogs();
      loadGdbEntries();
      if (!sessionId || sessionId === currentSession?._id) {
        setCurrentSession(null);
      }
    } catch (err: any) {
      showToast(`Push to GDB failed: ${err.message}`, 'error');
    } finally {
      setIsPushingFeedback(false);
    }
  };

  // --- Step 4B: Unresponded Farmer Cron Execution ---
  const handleTriggerEveningCron = async () => {
    try {
      setIsTriggeringCron(true);
      setCronExecutionResult(null);
      const res = await api.triggerNudgeCronNow();
      setCronExecutionResult(res);
      showToast(
        `Unresponded Farmer Cron completed! Dispatched feedback reminder with Yes/No buttons to ${res.nudges?.nudges_sent_count ?? res.total_nudged ?? 0} unresponded farmers.`
      );
      loadOngoingSessions();
      loadLogs();
      loadGdbEntries();
      loadCronStatus();
    } catch (err: any) {
      showToast(`Cron execution failed: ${err.message}`, 'error');
    } finally {
      setIsTriggeringCron(false);
    }
  };

  // Batch Push All Feedback Manually
  const handlePushAllFeedback = async () => {
    try {
      setIsPushingAll(true);
      const res = await api.pushAllFeedbackToGdb();
      showToast(`Successfully pushed ${res.total_pushed} feedback entries to GDB!`);
      loadOngoingSessions();
      loadLogs();
      loadGdbEntries();
    } catch (err: any) {
      showToast(`Batch push failed: ${err.message}`, 'error');
    } finally {
      setIsPushingAll(false);
    }
  };

  // Delete an ongoing session
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this ongoing session?')) return;
    try {
      await api.deleteOngoingSession(sessionId);
      showToast('Ongoing session deleted.');
      loadOngoingSessions();
    } catch (err: any) {
      showToast(`Failed to delete session: ${err.message}`, 'error');
    }
  };

  // Direct Twilio Nudge
  const handleSendNudge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSendingNudge(true);
      setNudgeResult(null);
      const res = await api.sendTwilioNudge({
        phone_number: nudgePhone,
        crop: nudgeCrop,
        custom_message: customNudgeText.trim() || undefined
      });
      setNudgeResult(res);
      showToast(`WhatsApp Nudge dispatched to ${res.to}!`);
      loadStatus();
      loadLogs();
      loadOngoingSessions();
    } catch (err: any) {
      showToast(`Failed to send nudge: ${err.message}`, 'error');
    } finally {
      setIsSendingNudge(false);
    }
  };

  // Direct GDB Dispatch
  const handleSendGdb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGdbId) {
      showToast('Please select a GDB Knowledge entry', 'error');
      return;
    }
    try {
      setIsSendingGdb(true);
      setGdbResult(null);
      const res = await api.sendTwilioGdb({
        phone_number: gdbPhone,
        gdb_id: selectedGdbId
      });
      setGdbResult(res);
      showToast(`GDB Answer transmitted to WhatsApp (${res.to})!`);
      loadStatus();
      loadLogs();
      loadOngoingSessions();
    } catch (err: any) {
      showToast(`Failed to transmit GDB answer: ${err.message}`, 'error');
    } finally {
      setIsSendingGdb(false);
    }
  };

  // Direct Incoming Simulation
  const handleSimulateIncoming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simMessageText.trim()) return;
    try {
      setIsSimulatingIncoming(true);
      setSimWebhookResult(null);
      const res = await api.simulateTwilioIncoming({
        from_number: simFromPhone,
        body: simMessageText.trim()
      });
      setSimWebhookResult(res);
      showToast(`Incoming farmer query processed by GDB Knowledge Engine!`);
      loadStatus();
      loadLogs();
      loadOngoingSessions();
    } catch (err: any) {
      showToast(`Simulation failed: ${err.message}`, 'error');
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  // Quick Reply Button Tap Simulation
  const handleSimulateButtonReply = async (buttonId: string, buttonText: string) => {
    try {
      setIsSimulatingIncoming(true);
      setSimWebhookResult(null);
      const res = await api.simulateTwilioIncoming({
        from_number: simFromPhone,
        body: buttonText,
        button_payload: buttonId,
        button_text: buttonText
      });
      setSimWebhookResult(res);
      showToast(`Quick Reply Button [${buttonText}] received! Rating immediately pushed to GDB knowledge base.`);
      loadStatus();
      loadLogs();
      loadOngoingSessions();
      loadGdbEntries();
    } catch (err: any) {
      showToast(`Button simulation failed: ${err.message}`, 'error');
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  const selectedEntry = gdbEntries.find((e) => e._id === selectedGdbId);

  const filteredEntries = gdbEntries.filter((e) => {
    if (!gdbSearchTerm.trim()) return true;
    const term = gdbSearchTerm.toLowerCase();
    return (
      e.crop.toLowerCase().includes(term) ||
      e.domain.toLowerCase().includes(term) ||
      e.question_hi.toLowerCase().includes(term) ||
      e.question_en.toLowerCase().includes(term)
    );
  });

  const pendingFeedbackCount = ongoingSessions.filter(
    (s) => s.has_responded || s.status === 'FEEDBACK_RECEIVED' || s.rating !== null
  ).length;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-xl text-sm transition-all animate-bounce ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : toastMessage.type === 'info'
              ? 'bg-sky-950/90 text-sky-200 border-sky-500/40'
              : 'bg-rose-950/90 text-rose-200 border-rose-500/40'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 size={18} />}
          {toastMessage.type === 'info' && <Sparkles size={18} />}
          {toastMessage.type === 'error' && <AlertTriangle size={18} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                <PhoneCall size={24} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold font-['Outfit'] text-white flex items-center gap-2.5">
                  WhatsApp Agri-Nudge & Ongoing Session Pipeline
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    GDB v2.4
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Automated evening leisure nudges, active inquiry session tracking, and 2-way feedback push (Manual + 7PM/9PM Cron)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadStatus();
                loadLogs();
                loadOngoingSessions();
                loadCronStatus();
              }}
              disabled={isLoadingStatus || isLoadingLogs || isLoadingSessions}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCw size={14} className={isLoadingStatus || isLoadingSessions ? 'animate-spin' : ''} />
              <span>Refresh All</span>
            </button>
          </div>
        </div>

        {/* Live Metrics Quick Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-white/10">
          <div className="bg-slate-950/50 border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ongoing Farmer Sessions</div>
              <div className="text-sm font-bold text-white mt-1 flex items-center gap-2">
                <span className="text-emerald-400 font-mono text-base">{ongoingSessions.length}</span>
                <span className="text-[11px] text-slate-400">active inquiries</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Layers size={18} />
            </div>
          </div>

          <div className="bg-slate-950/50 border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pending Feedback to Push</div>
              <div className="text-sm font-bold text-white mt-1 flex items-center gap-2">
                <span className="text-amber-400 font-mono text-base">{pendingFeedbackCount}</span>
                <span className="text-[11px] text-slate-400">ready for GDB</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="bg-slate-950/50 border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Automated Cron Jobs</div>
              <div className="text-xs font-mono font-bold text-sky-300 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                7:00 PM & 9:00 PM IST
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Calendar size={18} />
            </div>
          </div>

          <div className="bg-slate-950/50 border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Gateway Status</div>
              <div className="text-xs font-bold text-white mt-1 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${twilioStatus?.configured ? 'bg-emerald-400' : 'bg-teal-400'}`} />
                {twilioStatus?.configured ? 'Twilio Live Connected' : 'Simulated / Standalone'}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
              <Zap size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-white/10 gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('presentation_lab')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'presentation_lab'
              ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sparkles size={16} className="text-emerald-400" />
          <span>Interactive Simulation & Presentation Lab</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-200">No Twilio Needed</span>
        </button>

        <button
          onClick={() => setActiveTab('ongoing_sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ongoing_sessions'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers size={16} />
          <span>Active Ongoing Sessions</span>
          {ongoingSessions.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
              {ongoingSessions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('cron_automation')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'cron_automation'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Clock size={16} />
          <span>7PM / 9PM Cron Automation</span>
        </button>

        <button
          onClick={() => setActiveTab('live_gateway')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'live_gateway'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Bot size={16} />
          <span>Twilio Gateway & Direct Dispatch</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: INTERACTIVE PRESENTATION LAB (NO TWILIO NEEDED)                   */}
      {/* ========================================================================= */}
      {activeTab === 'presentation_lab' && (
        <div className="space-y-6">
          {/* Visual Step Progression Bar */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div
                onClick={() => setSimStep(1)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  simStep === 1
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>Step 1: Farmer Inquires</span>
                  <span className="w-5 h-5 rounded-full bg-emerald-500/30 flex items-center justify-center text-[10px]">1</span>
                </div>
                <div className="text-[11px] text-slate-400">Ask question from GDB (not yet feedback)</div>
              </div>

              <div
                onClick={() => setSimStep(2)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  simStep === 2
                    ? 'bg-amber-500/20 border-amber-500/50 text-white'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>Step 2: Evening Nudge</span>
                  <span className="w-5 h-5 rounded-full bg-amber-500/30 flex items-center justify-center text-[10px]">2</span>
                </div>
                <div className="text-[11px] text-slate-400">Agro-chrono nudge if unresponded</div>
              </div>

              <div
                onClick={() => setSimStep(3)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  simStep === 3
                    ? 'bg-sky-500/20 border-sky-500/50 text-white'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>Step 3: Farmer Responds</span>
                  <span className="w-5 h-5 rounded-full bg-sky-500/30 flex items-center justify-center text-[10px]">3</span>
                </div>
                <div className="text-[11px] text-slate-400">1-Tap Helpful / Unhelpful rating</div>
              </div>

              <div
                onClick={() => setSimStep(4)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  simStep === 4
                    ? 'bg-purple-500/20 border-purple-500/50 text-white'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>Step 4: Push to GDB</span>
                  <span className="w-5 h-5 rounded-full bg-purple-500/30 flex items-center justify-center text-[10px]">4</span>
                </div>
                <div className="text-[11px] text-slate-400">Manual Push + WhatsApp notification or 7/9PM Cron</div>
              </div>
            </div>
          </div>

          {/* Step 1: Farmer Inquires & Answers from GDB */}
          {simStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-['Outfit'] text-white">
                      Step 1: Farmer Agricultural Inquiry
                    </h3>
                    <p className="text-xs text-slate-400">
                      Answers are certified from GDB. Asking alone is stored in active ongoing sessions, not yet feedback.
                    </p>
                  </div>
                </div>

                {/* Preset Picker */}
                <div className="mb-4">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Select Quick Sample Farmer Question:
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {presetQuestions.map((pq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setLabCrop(pq.crop);
                          setLabQuestion(pq.text);
                        }}
                        className={`text-left text-xs p-2.5 rounded-xl border transition-all cursor-pointer ${
                          labQuestion === pq.text
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-950/60 border-white/5 text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="font-semibold text-emerald-400">{pq.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{pq.text}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleAskQuestion} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Farmer Phone
                      </label>
                      <input
                        type="text"
                        value={labPhone}
                        onChange={(e) => setLabPhone(e.target.value)}
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Farmer State / Region
                      </label>
                      <select
                        value={labState}
                        onChange={(e) => setLabState(e.target.value)}
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Punjab">Punjab</option>
                        <option value="Haryana">Haryana</option>
                        <option value="Uttar Pradesh">Uttar Pradesh</option>
                        <option value="Rajasthan">Rajasthan</option>
                        <option value="Madhya Pradesh">Madhya Pradesh</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Farmer Question (Any Crop Supported)
                      </label>
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                        <span>✨ Auto Crop Detection Active</span>
                      </span>
                    </div>
                    <textarea
                      value={labQuestion}
                      onChange={(e) => setLabQuestion(e.target.value)}
                      placeholder="Type question about any crop (सरसों, धान, कपास, गन्ना, सोयाबीन, चना, गेहूं...)"
                      rows={3}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAskingQuestion}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send size={16} />
                    <span>{isAskingQuestion ? 'Searching GDB Catalog...' : 'Submit Inquiry & Retrieve GDB Answer'}</span>
                  </button>
                </form>
              </div>

              {/* Inquiry Output / GDB Answer Preview */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <BookOpen size={14} className="text-emerald-400" />
                    Verified GDB Answer Response
                  </h4>

                  {questionAnswerResult ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Matched GDB ID: {questionAnswerResult.gdb_id}
                        </span>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          Crop: {questionAnswerResult.crop}
                        </span>
                      </div>

                      {/* Show matched canonical question from GDB */}
                      {(questionAnswerResult.question_hi || questionAnswerResult.question_en) && (
                        <div className="text-[11px] text-slate-400 bg-slate-950/60 rounded-lg px-3 py-2 border border-white/5">
                          <span className="font-semibold text-slate-300">Matched GDB Q: </span>
                          {questionAnswerResult.question_hi || questionAnswerResult.question_en}
                        </div>
                      )}

                      <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 text-xs font-mono text-emerald-200 leading-relaxed whitespace-pre-line shadow-inner">
                        {`🌾 *AjraSakha प्रमाणित समाधान (GDB)*

${questionAnswerResult.answer_hi || questionAnswerResult.answer_en}

----------------------------------------
📢 *नोट:* यह केवल जानकारी है। आपकी प्रतिक्रिया मिलने पर ही इसे फ़ीडबैक माना जाएगा।`}
                      </div>

                      <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 space-y-1">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-emerald-400" />
                          <span>Active Session Document Created/Updated in DB (`ongoing_farmer_sessions`)</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Session ID: <code className="text-sky-300">{questionAnswerResult.session?._id}</code> | Status: <span className="text-amber-300 font-bold">AWAITING_FEEDBACK</span>
                        </div>
                        <div className="text-[11px] text-slate-500 italic">
                          A new question replaces the previous open session for this farmer — not counted as feedback.
                        </div>
                      </div>

                      {/* Interactive Rating Prompt: Show response answer, then ask for rating */}
                      <div className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-950 border border-emerald-500/40 rounded-xl space-y-3 shadow-lg">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <ThumbsUp size={14} className="text-emerald-400" />
                            <span>Ask Farmer for 1-Tap Rating on this Advice</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            1-Tap Rating
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          ❓ <em>क्या यह जानकारी आपके लिए उपयोगी थी? (Was this response answer helpful?)</em>
                        </p>

                        {currentSession?.has_responded || currentSession?.status === 'FEEDBACK_RECEIVED' ? (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={16} className="text-emerald-400" />
                              <span className="text-xs font-bold text-emerald-300">
                                Rating Recorded: {currentSession.rating === 1 ? '👍 1: Helpful (उपयोगी)' : '👎 2: Unhelpful (अनुपयोगी)'}
                              </span>
                            </div>
                            <button
                              onClick={() => setSimStep(4)}
                              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-purple-600/20"
                            >
                              <span>Proceed to Step 4: Push to GDB</span>
                              <ChevronRight size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2.5">
                              <button
                                type="button"
                                onClick={() => handleDirectRate(1)}
                                disabled={isSubmittingFeedback}
                                className="py-2.5 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <ThumbsUp size={14} />
                                <span>👍 हाँ / Yes: Helpful (उपयोगी)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDirectRate(2)}
                                disabled={isSubmittingFeedback}
                                className="py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <ThumbsDown size={14} />
                                <span>👎 नहीं / No: Unhelpful (सुधार चाहिए)</span>
                              </button>
                            </div>

                            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                              <span>Farmer does not respond yet?</span>
                              <button
                                onClick={() => setSimStep(2)}
                                className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <span>Send Evening Leisure Nudge (Step 2)</span>
                                <ChevronRight size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-xs text-slate-500">
                      Select or type a question on the left to observe certified GDB matching and session storage.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Automated Evening Leisure Nudge */}
          {simStep === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-['Outfit'] text-white">
                      Step 2: Evening Leisure Nudge (Agro-Chrono)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Requirement: Automated cron job sends leisure nudge if farmer has not yet responded.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-white/10 rounded-xl p-4 text-xs space-y-2 mb-4">
                  <div className="text-slate-300">
                    <strong>Farmer Recipient:</strong> <span className="font-mono text-emerald-400">{labPhone}</span>
                  </div>
                  <div className="text-slate-300">
                    <strong>Crop Advisory:</strong> {labCrop}
                  </div>
                  <div className="text-slate-300">
                    <strong>Current Status:</strong> <span className="text-amber-300 font-bold">AWAITING_FEEDBACK</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed pt-1 border-t border-white/5">
                    According to human-in-the-loop cron rules, unresponded inquiries receive a friendly WhatsApp nudge during farmer leisure hours (7:00 PM - 9:00 PM) prompting for 1-tap feedback.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleSimulateNudge}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Bell size={16} />
                    <span>Send Leisure Nudge to Farmer WhatsApp</span>
                  </button>

                  <button
                    onClick={() => setSimStep(3)}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all border border-white/10"
                  >
                    <span>Skip to Farmer Response (Step 3)</span>
                    <ChevronRight size={14} />
                  </button>

                  {/* Farmer asks a new question instead of waiting for nudge */}
                  <button
                    onClick={() => {
                      setLabQuestion('');
                      setQuestionAnswerResult(null);
                      setSimStep(1);
                    }}
                    className="w-full py-2 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all border border-emerald-500/20"
                  >
                    <MessageSquare size={13} />
                    <span>Farmer Asks a New Question Instead (Updates Open Session)</span>
                  </button>
                </div>
              </div>

              {/* Nudge Farmer WhatsApp Screen Preview */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-400" />
                    Simulated Farmer WhatsApp Screen
                  </h4>
                  <div className="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-4 text-xs font-mono text-emerald-200 leading-relaxed whitespace-pre-line shadow-inner">
                    {`🌾 *AjraSakha कृषि-मित्र सांध्यकालीन संदेश*

नमस्ते किसान भाई! 🙏
आज आपने *${labCrop}* की फसल के संबंध में सलाह ली थी। क्या दी गई जानकारी आपके खेत के लिए उपयोगी रही?

👇 कृपया नीचे दिए गए नंबर लिखकर उत्तर दें:
1️⃣ *1* या *हाँ (Helpful)* - समस्या का समाधान हुआ
2️⃣ *2* या *नहीं (Unhelpful)* - सलाह में सुधार चाहिए

🎙️ आप अपना अनुभव वॉइस नोट (Voice Message) भेजकर भी बता सकते हैं।
— *AjraSakha AI Agri-Intel (IIT Ropar)*`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Farmer Responds with Feedback */}
          {simStep === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                    <ThumbsUp size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-['Outfit'] text-white">
                      Step 3: Farmer Submits Feedback
                    </h3>
                    <p className="text-xs text-slate-400">
                      Once the farmer responds, that becomes feedback and is updated in `ongoing_farmer_sessions`.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  {/* New question option — farmer asks instead of rating */}
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-start gap-2.5">
                    <MessageSquare size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        <span className="font-bold text-emerald-300">Farmer asks a new question?</span> A new question will update the open session with the new GDB answer — it will <em>not</em> be counted as feedback.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLabQuestion('');
                          setQuestionAnswerResult(null);
                          setSimStep(1);
                        }}
                        className="mt-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare size={11} />
                        Ask a New Question (Go to Step 1)
                      </button>
                    </div>
                  </div>
                  {/* Rating Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Farmer Response Rating
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setLabRating(1);
                          setLabComment('सलाह बहुत उपयोगी रही, 3 दिन में पीले धब्बे रुक गए।');
                        }}
                        className={`p-3.5 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all cursor-pointer ${
                          labRating === 1
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10'
                            : 'bg-slate-950/60 border-white/10 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        <ThumbsUp size={16} className="text-emerald-400" />
                        <span>1: Helpful (उपयोगी)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLabRating(2);
                          setLabComment('दवा छिड़कने के बाद भी रोग नहीं रुका, खर्च व्यर्थ गया।');
                        }}
                        className={`p-3.5 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all cursor-pointer ${
                          labRating === 2
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md shadow-rose-500/10'
                            : 'bg-slate-950/60 border-white/10 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        <ThumbsDown size={16} className="text-rose-400" />
                        <span>2: Unhelpful (अनुपयोगी)</span>
                      </button>
                    </div>
                  </div>

                  {/* Root Cause Selector (for negative feedback) */}
                  {labRating === 2 && (
                    <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-2">
                      <label className="block text-xs font-bold text-rose-300">
                        Select Ground Root Cause (Ground Discrepancy):
                      </label>
                      <select
                        value={labRootCause}
                        onChange={(e) => setLabRootCause(e.target.value)}
                        className="w-full bg-slate-950 border border-rose-500/40 rounded-xl p-2.5 text-xs text-white focus:outline-none"
                      >
                        <option value="none">-- Select Root Cause Category --</option>
                        <option value="WEATHER_MISMATCH">Weather Mismatch (मौसम प्रतिकूल था)</option>
                        <option value="COST_PROHIBITIVE">Cost Prohibitive (दवा अत्यधिक महंगी)</option>
                        <option value="CHEMICAL_UNAVAILABLE">Chemical Unavailable (स्थानीय बाजार में अनुपलब्ध)</option>
                        <option value="INEFFECTIVE_DOSAGE">Ineffective Dosage (अनुशंसित मात्रा से लाभ नहीं)</option>
                        <option value="LATE_APPLICATION">Late Application (देरी से छिड़काव)</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Farmer Comment / Voice Note Transcript
                    </label>
                    <textarea
                      value={labComment}
                      onChange={(e) => setLabComment(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingFeedback}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Check size={16} />
                    <span>{isSubmittingFeedback ? 'Recording Feedback...' : 'Submit Farmer Feedback Response'}</span>
                  </button>
                </form>
              </div>

              {/* Status info & Response Answer Preview */}
              <div className="lg:col-span-6 space-y-4">
                {(questionAnswerResult || currentSession?.gdb_answer) && (
                  <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <BookOpen size={14} className="text-emerald-400" />
                      Response Answer Being Rated (GDB Solution)
                    </h4>
                    <div className="text-[11px] text-slate-300">
                      <strong>Question:</strong> <span className="text-white font-medium">{labQuestion || currentSession?.question}</span>
                    </div>
                    <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5 text-xs font-mono text-emerald-200 leading-relaxed whitespace-pre-line shadow-inner max-h-60 overflow-y-auto">
                      {questionAnswerResult?.answer_hi || questionAnswerResult?.answer_en || currentSession?.gdb_answer}
                    </div>
                  </div>
                )}

                <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-sky-400" />
                    Lifecycle Explanation
                  </h4>
                  <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                    <p>
                      <strong>1. Initial inquiry:</strong> The farmer’s initial query is answered directly from GDB and stored in <code className="text-emerald-300">ongoing_farmer_sessions</code>.
                    </p>
                    <p>
                      <strong>2. Immediate GDB push upon feedback:</strong> As soon as the farmer gives feedback (Yes/No or 1/2), the rating is <em>immediately pushed to the corresponding GDB entry</em>, updating metrics and triggering statistical drift quality scans in real time.
                    </p>
                    <p>
                      <strong>3. Unresponded Farmer Cron:</strong> The 7PM & 9PM IST cron job only sends feedback reminder messages with Yes/No interactive buttons to farmers who have <em>not</em> yet given feedback.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: 2 Ways to Push to GDB (Manual + Automatic Cron) */}
          {simStep === 4 && (
            <div className="space-y-6">
              <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                    <Zap size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-['Outfit'] text-white">
                      Step 4: Push Feedback to GDB Entry (2 Ways)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Requirement: 1) Manually (Farmer is notified via WhatsApp) or 2) Automatically via 7PM & 9PM IST Cron Job.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
                  {/* Way 1: Manual Push */}
                  <div className="bg-slate-950/70 border border-purple-500/30 rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-300">Way 1: Manual Push</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                          Notifies Farmer via WhatsApp
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-sm mb-1.5">
                        Push Immediately & Dispatch Farmer WhatsApp Confirmation
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        Immediately increments GDB entry metrics, evaluates statistical flagging drift, sends a courteous WhatsApp confirmation to the farmer, and removes the document from <code className="text-purple-300">ongoing_farmer_sessions</code>.
                      </p>
                    </div>

                    <button
                      onClick={() => handleManualPush()}
                      disabled={isPushingFeedback || !currentSession}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Send size={15} />
                      <span>{isPushingFeedback ? 'Pushing & Notifying...' : 'Push Manually & Notify Farmer on WhatsApp'}</span>
                    </button>
                  </div>

                  {/* Way 2: Automatic Cron Push */}
                  <div className="bg-slate-950/70 border border-sky-500/30 rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-sky-300">Way 2: Automatic (Cron Job)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold">
                          7:00 PM & 9:00 PM IST
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-sm mb-1.5">
                        Batch Auto-Push Cron Execution
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        Runs twice every evening (19:00 & 21:00 IST). Nudges unresponded sessions and automatically pushes all pending received feedback to GDB entries in batch, deleting completed sessions from the ongoing collection.
                      </p>
                    </div>

                    <button
                      onClick={handleTriggerEveningCron}
                      disabled={isTriggeringCron}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Play size={15} />
                      <span>{isTriggeringCron ? 'Running Evening Cron...' : 'Simulate 7PM/9PM Cron Execution Now'}</span>
                    </button>
                  </div>
                </div>

                {/* Manual Push Result & Farmer Notification Preview */}
                {pushResult && (
                  <div className="mt-6 p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <CheckCircle2 size={18} />
                      <span>Manual Push Successful & Ongoing Session Deleted!</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/5 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="text-slate-400 font-semibold">GDB Metrics Updated:</div>
                        <div>Target GDB ID: <code className="text-emerald-300">{pushResult.gdb_id}</code></div>
                        <div>Rating Counted: <span className="font-bold text-white">{pushResult.rating === 1 ? '👍 Helpful (+1)' : '👎 Unhelpful (-1)'}</span></div>
                        <div>Deleted Session: <code className="text-slate-400">{pushResult.session_id}</code></div>
                      </div>

                      <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-xs font-mono text-emerald-200">
                        <div className="font-bold mb-1 text-emerald-400 flex items-center gap-1">
                          <Bot size={13} /> Farmer WhatsApp Notification Receipt:
                        </div>
                        <p className="whitespace-pre-line text-[11px] leading-relaxed">
                          {`🙏 *नमस्ते किसान भाई!*
आपकी फसल (*${labCrop}*) के संबंध में दी गई प्रतिक्रिया AjraSakha GDB ज्ञानकोष में सफलतापूर्वक दर्ज कर ली गई है।

हमारे कृषि वैज्ञानिक आपके सुझावों के आधार पर अनुशंसाओं को और अधिक उपयोगी बना रहे हैं। धन्यवाद! 🌱
— *AjraSakha AI Agri-Intel (IIT Ropar)*`}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => {
                          setSimStep(1);
                          setPushResult(null);
                          setQuestionAnswerResult(null);
                        }}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-semibold cursor-pointer"
                      >
                        Start Next Test Simulation
                      </button>
                    </div>
                  </div>
                )}

                {/* Cron Execution Result Preview */}
                {cronExecutionResult && (
                  <div className="mt-6 p-4 rounded-2xl bg-slate-950 border border-sky-500/40 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                      <CheckCircle2 size={16} />
                      <span>Evening Cron Job Execution Summary:</span>
                    </div>
                    <div className="text-slate-300">
                      • Nudges Sent to Unresponded Farmers: <strong className="text-amber-300">{cronExecutionResult.nudges?.total_nudged ?? 0}</strong>
                    </div>
                    <div className="text-slate-300">
                      • Feedback Batch Pushed to GDB: <strong className="text-emerald-300">{cronExecutionResult.auto_push?.total_pushed ?? 0}</strong>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Executed at: {new Date(cronExecutionResult.executed_at).toLocaleTimeString()} IST
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACTIVE ONGOING SESSIONS MONITOR                                   */}
      {/* ========================================================================= */}
      {activeTab === 'ongoing_sessions' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold font-['Outfit'] text-white flex items-center gap-2">
                  <Layers size={18} className="text-emerald-400" />
                  Active Ongoing Sessions Collection (`ongoing_farmer_sessions`)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stores active farmer inquiries until feedback is received and pushed to the corresponding GDB entry.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePushAllFeedback}
                  disabled={isPushingAll || pendingFeedbackCount === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                  title="Pushes all sessions with completed feedback to GDB"
                >
                  <Send size={13} />
                  <span>Push All Completed ({pendingFeedbackCount})</span>
                </button>

                <button
                  onClick={loadOngoingSessions}
                  disabled={isLoadingSessions}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-all cursor-pointer"
                >
                  <RotateCw size={13} className={isLoadingSessions ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {ongoingSessions.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No active ongoing sessions in the database. Use the "Interactive Simulation Lab" to submit farmer inquiries.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-3">Farmer Phone</th>
                      <th className="py-2.5 px-3">Crop / State</th>
                      <th className="py-2.5 px-3">Question / GDB ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Rating / Feedback</th>
                      <th className="py-2.5 px-3">Nudge Count</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {ongoingSessions.map((s) => {
                      const isReadyToPush = s.has_responded || s.status === 'FEEDBACK_RECEIVED' || s.rating !== null;
                      return (
                        <tr key={s._id} className="hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 text-emerald-300 font-bold whitespace-nowrap">
                            {s.phone_number}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="text-white font-sans">{s.crop}</span>
                            <span className="text-slate-500 text-[10px] ml-1">({s.farmer_state || 'Punjab'})</span>
                          </td>
                          <td className="py-2.5 px-3 max-w-xs font-sans">
                            <div className="truncate text-white" title={s.question}>{s.question}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">GDB: {s.gdb_id}</div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                            {s.status === 'AWAITING_FEEDBACK' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Awaiting Feedback
                              </span>
                            )}
                            {s.status === 'NUDGED' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                Nudged
                              </span>
                            )}
                            {s.status === 'FEEDBACK_RECEIVED' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Feedback Received
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            {s.rating === 1 ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <ThumbsUp size={12} /> Helpful
                              </span>
                            ) : s.rating === 2 ? (
                              <span className="text-rose-400 font-bold flex items-center gap-1">
                                <ThumbsDown size={12} /> Unhelpful
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">None yet</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="text-slate-400">{s.nudge_count ?? 0}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-sans">
                            <div className="flex items-center justify-end gap-1.5">
                              {isReadyToPush ? (
                                <button
                                  onClick={() => handleManualPush(s._id)}
                                  className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                  title="Push to GDB & notify farmer on WhatsApp"
                                >
                                  <Send size={11} />
                                  <span>Push & Notify</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleNudgeSession(s)}
                                    className="px-2 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                    title="Send evening leisure nudge to this farmer"
                                  >
                                    <Bell size={11} />
                                    <span>Nudge</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCurrentSession(s);
                                      setLabPhone(s.phone_number);
                                      setLabCrop(s.crop);
                                      setLabQuestion(s.question);
                                      setSimStep(3);
                                      setActiveTab('presentation_lab');
                                    }}
                                    className="px-2 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                    title="Simulate farmer feedback response"
                                  >
                                    <ThumbsUp size={11} />
                                    <span>Rate</span>
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleDeleteSession(s._id)}
                                className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete Session"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CRON AUTOMATION & SCHEDULES (7PM / 9PM & 2AM IST)                 */}
      {/* ========================================================================= */}
      {activeTab === 'cron_automation' && (
        <div className="space-y-6">
          {cronStatus && (
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-300">
                  APScheduler Core Engine: <strong className="text-white">{cronStatus.running ? 'Active & Scheduled' : 'Idle'}</strong> (Jobs registered: {cronStatus.jobs?.length ?? 2})
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Timezone: Asia/Kolkata (IST)</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: Evening WhatsApp Leisure Nudge & Feedback Auto-Push */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base font-['Outfit']">
                      Unresponded Farmers Feedback Nudge Cron
                    </h3>
                    <div className="text-xs text-amber-400 font-mono font-bold mt-0.5">
                      Trigger Schedule: 7:00 PM IST (19:00) & 9:00 PM IST (21:00)
                    </div>
                  </div>
                </div>
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" title="Cron Active" />
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Automated cron engine scheduled twice daily. Exclusively sends feedback reminder messages with Yes/No interactive buttons to farmers who have not yet responded:
              </p>

              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-4 text-xs space-y-2 font-mono">
                <div className="text-emerald-300 font-bold font-sans">Workflow Execution Rules:</div>
                <div className="text-slate-300">
                  1. <strong>Nudge Unresponded:</strong> Scans <code className="text-amber-300">ongoing_farmer_sessions</code> for farmers with <code>has_responded != True</code>. Dispatches reminder with Yes/No buttons attached.
                </div>
                <div className="text-slate-300">
                  2. <strong>Immediate GDB Sync:</strong> Ratings are pushed to GDB immediately upon feedback, so the cron job never needs to batch-push feedback.
                </div>
                <div className="text-slate-300">
                  3. <strong>Cleanup Ongoing:</strong> Completed sessions are deleted from ongoing collection as soon as feedback is received.
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleTriggerEveningCron}
                  disabled={isTriggeringCron}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play size={15} />
                  <span>{isTriggeringCron ? 'Executing Unresponded Farmer Cron...' : 'Trigger Unresponded Farmer Nudge Cron Now'}</span>
                </button>
              </div>
            </div>

            {/* Card 2: 2:00 AM IST Statistical Flagging Scan */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base font-['Outfit']">
                      Nightly Statistical Flagging & Drift Scan
                    </h3>
                    <div className="text-xs text-purple-400 font-mono font-bold mt-0.5">
                      Trigger Schedule: 2:00 AM IST (02:00) Daily
                    </div>
                  </div>
                </div>
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" title="Cron Active" />
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Deep statistical analysis scan that monitors feedback ratios across all GDB knowledge entries:
              </p>

              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-4 text-xs space-y-2 font-mono">
                <div className="text-purple-300 font-bold font-sans">Quality Threshold Rules:</div>
                <div className="text-slate-300">
                  • <strong>Min Feedback Sample:</strong> ≥ 5 farmer responses required before evaluation.
                </div>
                <div className="text-slate-300">
                  • <strong>Helpful Threshold:</strong> Ratio &lt; 65.0% automatically flags entry into Flagged Queue.
                </div>
                <div className="text-slate-300">
                  • <strong>Scientist Review:</strong> Flagged entries await IIT Ropar agronomist review (Update / Retire with AI / Dismiss).
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={async () => {
                    try {
                      const res = await api.triggerCronNow();
                      showToast(`Nightly Flagging Scan triggered! Scanned: ${res.scanned ?? 0}, Flagged: ${res.newly_flagged ?? 0}`);
                    } catch (e: any) {
                      showToast(`Scan failed: ${e.message}`, 'error');
                    }
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Play size={15} />
                  <span>Trigger 2:00 AM Statistical Flagging Scan Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TWILIO GATEWAY & DIRECT DISPATCH (FOR LIVE CREDENTIALS)           */}
      {/* ========================================================================= */}
      {activeTab === 'live_gateway' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Direct Nudge Dispatch */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold font-['Outfit'] text-white mb-1 flex items-center gap-2">
                  <Bell size={18} className="text-amber-400" />
                  Direct WhatsApp Nudge via Twilio
                </h3>
                <p className="text-xs text-slate-400">
                  Transmits real WhatsApp message to farmer number via Twilio API.
                </p>
              </div>

              <form onSubmit={handleSendNudge} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Farmer Phone
                  </label>
                  <input
                    type="text"
                    value={nudgePhone}
                    onChange={(e) => setNudgePhone(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Crop (Wheat, Mustard, Paddy, Cotton, Sugarcane, Gram, Soybean, etc.)
                  </label>
                  <input
                    type="text"
                    value={nudgeCrop}
                    onChange={(e) => setNudgeCrop(e.target.value)}
                    placeholder="e.g. Wheat, Mustard, Paddy, Cotton, Sugarcane..."
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Custom Message (Optional)
                  </label>
                  <textarea
                    value={customNudgeText}
                    onChange={(e) => setCustomNudgeText(e.target.value)}
                    placeholder="Leave blank for default bilingual nudge..."
                    rows={2}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSendingNudge}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send size={14} />
                  <span>{isSendingNudge ? 'Sending via Twilio...' : 'Send WhatsApp Nudge'}</span>
                </button>
              </form>

              {nudgeResult && (
                <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                  <div className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Nudge Dispatched!
                  </div>
                  <div>To: {nudgeResult.to}</div>
                  <div>Status: {nudgeResult.status} ({nudgeResult.mode})</div>
                  <div>SID: <code className="text-sky-300">{nudgeResult.sid}</code></div>
                </div>
              )}
            </div>

            {/* Direct GDB Solution Transmission */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold font-['Outfit'] text-white mb-1 flex items-center gap-2">
                  <BookOpen size={18} className="text-sky-400" />
                  Transmit GDB Knowledge Answer
                </h3>
                <p className="text-xs text-slate-400">
                  Transmits certified GDB solution directly to farmer WhatsApp.
                </p>
              </div>

              <form onSubmit={handleSendGdb} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Farmer Phone
                  </label>
                  <input
                    type="text"
                    value={gdbPhone}
                    onChange={(e) => setGdbPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Search GDB Catalog
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={gdbSearchTerm}
                      onChange={(e) => setGdbSearchTerm(e.target.value)}
                      placeholder="Filter by crop, keyword..."
                      className="w-full bg-slate-950 border border-white/15 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                    <Search size={13} className="absolute left-2.5 top-2 text-slate-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Select GDB Entry ({filteredEntries.length})
                  </label>
                  <select
                    value={selectedGdbId}
                    onChange={(e) => setSelectedGdbId(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl p-2 text-xs text-white"
                  >
                    {filteredEntries.map((e) => (
                      <option key={e._id} value={e._id}>
                        [{e.crop}] {e.question_hi || e.question_en}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEntry && (
                  <div className="bg-sky-950/20 border border-sky-500/20 rounded-xl p-2.5 text-[11px] text-sky-200 line-clamp-2">
                    {selectedEntry.answer_hi || selectedEntry.answer_en}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingGdb || !selectedGdbId}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send size={14} />
                  <span>{isSendingGdb ? 'Transmitting...' : 'Transmit GDB Answer to WhatsApp'}</span>
                </button>
              </form>

              {gdbResult && (
                <div className="bg-slate-950 border border-sky-500/30 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                  <div className="text-sky-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> GDB Transmitted!
                  </div>
                  <div>GDB ID: <code className="text-emerald-300">{gdbResult.gdb_id}</code></div>
                  <div>Recipient: {gdbResult.to}</div>
                  <div>SID: <code className="text-sky-300">{gdbResult.sid}</code></div>
                </div>
              )}
            </div>
          </div>

          {/* Webhook Simulation Card */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
            <h3 className="text-base font-bold font-['Outfit'] text-white mb-1 flex items-center gap-2">
              <Sparkles size={18} className="text-teal-400" />
              Incoming Twilio Webhook Simulator
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Simulate an incoming WhatsApp webhook message to test automatic GDB responses and ongoing session recording.
            </p>

            <form onSubmit={handleSimulateIncoming} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    From Phone Number
                  </label>
                  <input
                    type="text"
                    value={simFromPhone}
                    onChange={(e) => setSimFromPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Message Body (Query or Rating: 1 / 2)
                  </label>
                  <input
                    type="text"
                    value={simMessageText}
                    onChange={(e) => setSimMessageText(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSimulatingIncoming}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap size={14} />
                <span>{isSimulatingIncoming ? 'Simulating Webhook...' : 'Simulate Incoming Farmer Message'}</span>
              </button>
            </form>

            {/* Quick Reply Button 1-Tap Simulation */}
            <div className="mt-4 pt-4 border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-400" />
                  Twilio WhatsApp Quick Reply Button Triggers (1-Tap):
                </span>
                <span className="text-[10px] text-teal-300 bg-teal-500/20 px-2.5 py-0.5 rounded-full font-mono border border-teal-500/30">
                  Direct Status → FEEDBACK_RECEIVED
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Clicking either button simulates WhatsApp sending the quick-reply payload. The ongoing session status updates directly without waiting or requiring text reviews.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSimulateButtonReply('1', '👍 हाँ / Yes (उपयोगी)')}
                  disabled={isSimulatingIncoming}
                  className="py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 shadow-sm"
                >
                  <ThumbsUp size={14} />
                  <span>Tap [👍 हाँ / Yes (उपयोगी)]</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulateButtonReply('2', '👎 नहीं / No (सुधार चाहिए)')}
                  disabled={isSimulatingIncoming}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 shadow-sm"
                >
                  <ThumbsDown size={14} />
                  <span>Tap [👎 नहीं / No (सुधार चाहिए)]</span>
                </button>
              </div>
            </div>

            {simWebhookResult && (
              <div className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-teal-500/30 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-teal-300 flex items-center gap-1.5">
                    <CheckCircle2 size={15} />
                    Webhook Event Processed:
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/10 text-white font-mono">
                    {simWebhookResult.action}
                  </span>
                </div>
                {simWebhookResult.status && (
                  <div className="text-[11px] text-emerald-400 font-medium">
                    Session Status: <span className="font-mono bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300 border border-emerald-500/30">{simWebhookResult.status}</span>
                    {simWebhookResult.rating && (
                      <span className="ml-2 text-white">
                        (Rating: {simWebhookResult.rating === 1 ? '👍 1: Helpful' : '👎 2: Unhelpful'})
                      </span>
                    )}
                  </div>
                )}
                {simWebhookResult.outgoing_reply && (
                  <div className="p-2.5 bg-white/5 rounded-lg text-emerald-200 font-mono text-[11px] whitespace-pre-line mt-1 border border-white/5">
                    {simWebhookResult.outgoing_reply}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISPATCH & INTERACTION LOGS */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-emerald-400" />
            <h3 className="font-bold text-sm text-white font-['Outfit']">
              Live WhatsApp Interaction Audit Log
            </h3>
            <span className="text-xs text-slate-400">({logs.length} logged messages)</span>
          </div>
          <button
            onClick={loadLogs}
            disabled={isLoadingLogs}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RotateCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} />
            <span>Refresh Logs</span>
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No WhatsApp interactions logged yet. Run simulation steps above to view live audit traces.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3">Time (IST)</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">To / From</th>
                  <th className="py-2.5 px-3">Message Content</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {log.direction === 'OUTGOING' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <ArrowUpRight size={11} /> Outgoing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                          <ArrowDownLeft size={11} /> Incoming
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-400">
                      {log.message_type || (log.direction === 'INCOMING' ? 'FARMER_QUERY' : 'GENERAL')}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-300">
                      {log.direction === 'OUTGOING' ? log.to : log.from}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-300 max-w-md">
                      <div className="truncate" title={log.body}>{log.body}</div>
                      {log.button_payload && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 font-sans">
                            🔘 Quick Reply: Payload "{log.button_payload}"
                          </span>
                        </div>
                      )}
                      {log.buttons && log.buttons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {log.buttons.map((b: any, idx: number) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-sans">
                              🔘 {b.title || b.payload}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        log.status === 'delivered' || log.status === 'sent' || log.status === 'simulated_delivered'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {log.status || 'received'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
