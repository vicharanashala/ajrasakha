import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useAppContext } from '../context/AppContext';
import type { WhatsAppSimulateResponse, FarmerSession, VoiceAnalysis } from '../types';
import { 
  Send, 
  Mic, 
  ThumbsUp, 
  ThumbsDown, 
  RotateCcw, 
  Clock, 
  CheckCheck, 
  Sparkles, 
  Smartphone, 
  MessageSquare,
  Volume2,
  X,
  AlertTriangle
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  buttons?: Array<{ id?: string; title: string; payload?: number; value?: number }>;
  rootCauses?: Array<{ id?: string; code?: string; label?: string; label_hi?: string; label_en?: string }>;
  voiceAnalysis?: VoiceAnalysis;
  isVoice?: boolean;
}

export const WhatsAppSimulator: React.FC = () => {
  const { isOnline } = useAppContext();
  const [phoneNumber, setPhoneNumber] = useState('919876543210');
  const [farmerState, setFarmerState] = useState('Punjab');
  const [language, setLanguage] = useState('hi');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [session, setSession] = useState<FarmerSession | null>(null);

  // Active chat stream
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: '🙏 नमस्ते किसान भाई! मैं अजरासखा (AjraSakha) कृषि सहायक हूँ। आप अपनी फसल, कीट, बीमारी या खाद से जुड़ा कोई भी प्रश्न पूछ सकते हैं।',
      timestamp: '10:00 AM'
    }
  ]);

  // Voice note simulation modal/state
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceInput, setVoiceInput] = useState('ਦਵਾਈ ਬਹੁਤ ਵਧੀਆ ਸੀ, ਕਣਕ ਨੂੰ ਬਹੁਤ ਫਾਇਦਾ ਹੋਇਆ ਧੰਨਵਾਦ');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Refresh session info
  const loadSession = async () => {
    try {
      const sess = await api.getFarmerSession(phoneNumber);
      setSession(sess);
    } catch {
      setSession(null);
    }
  };

  useEffect(() => {
    loadSession();
  }, [phoneNumber]);

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Send regular text message
  const handleSendText = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: textToSend,
      timestamp: getCurrentTime()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const resp: WhatsAppSimulateResponse = await api.simulateWhatsAppTurn({
        phone_number: phoneNumber,
        message_body: textToSend,
        farmer_state: farmerState,
        language: language,
        input_type: 'TEXT'
      });

      // If the farmer asked a new question while an old session was open,
      // inject a system notice before the bot answer
      if (resp.is_new_question_on_open_session) {
        const noticeMsg: ChatMessage = {
          id: String(Date.now() + 0.5),
          sender: 'bot',
          text: '📋 नया प्रश्न स्वीकार किया गया। पुराना सत्र अद्यतन किया जा रहा है — पुराने प्रश्न की प्रतिक्रिया रद्द नहीं हुई, केवल प्रश्न बदला।\n\n(New question received — ongoing session updated with new GDB context.)',
          timestamp: getCurrentTime()
        };
        setMessages((prev) => [...prev, noticeMsg]);
      }

      if (resp.outgoing_messages && resp.outgoing_messages.length >= 2) {
        // 1. First show the verified agronomic response answer from GDB
        const answerMsg: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'bot',
          text: resp.outgoing_messages[0],
          timestamp: getCurrentTime()
        };

        // 2. Then ask for 1-tap rating with feedback buttons
        const ratingMsg: ChatMessage = {
          id: String(Date.now() + 2),
          sender: 'bot',
          text: resp.outgoing_messages[1],
          timestamp: getCurrentTime(),
          buttons: resp.quick_reply_buttons
        };

        setMessages((prev) => [...prev, answerMsg, ratingMsg]);
      } else {
        const botMsg: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'bot',
          text: resp.bot_response_text || (resp.outgoing_messages ? resp.outgoing_messages[0] : ''),
          timestamp: getCurrentTime(),
          buttons: resp.quick_reply_buttons,
          rootCauses: resp.root_cause_options
        };
        setMessages((prev) => [...prev, botMsg]);
      }
      await loadSession();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'bot',
          text: `⚠️ Error communicating with server: ${err.message}`,
          timestamp: getCurrentTime()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // 1-Tap Quick-Reply Button Click (Thumbs Up or Down)
  const handleButtonClick = async (btnValue: number, btnTitle: string) => {
    if (isSending) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: btnTitle,
      timestamp: getCurrentTime()
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    try {
      const resp = await api.simulateWhatsAppTurn({
        phone_number: phoneNumber,
        farmer_state: farmerState,
        language: language,
        input_type: 'BUTTON_CLICK',
        button_value: btnValue
      });

      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: resp.bot_response_text || (resp.outgoing_messages ? resp.outgoing_messages[0] : ''),
        timestamp: getCurrentTime(),
        rootCauses: resp.root_cause_options
      };

      setMessages((prev) => [...prev, botMsg]);
      await loadSession();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Farmer selects Root Cause for negative feedback
  const handleSelectRootCause = async (causeCode: string, label: string) => {
    if (isSending) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: `समस्या: ${label}`,
      timestamp: getCurrentTime()
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    try {
      const resp = await api.simulateWhatsAppTurn({
        phone_number: phoneNumber,
        farmer_state: farmerState,
        language: language,
        input_type: 'TEXT',
        root_cause_selected: causeCode
      });

      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: resp.bot_response_text || (resp.outgoing_messages ? resp.outgoing_messages[0] : ''),
        timestamp: getCurrentTime()
      };

      setMessages((prev) => [...prev, botMsg]);
      await loadSession();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Send Voice Note simulation
  const handleSendVoiceNote = async () => {
    if (!voiceInput.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: `🎙️ [आवाज़ संदेश / Voice Note]: "${voiceInput}"`,
      timestamp: getCurrentTime(),
      isVoice: true
    };
    setMessages((prev) => [...prev, userMsg]);
    setShowVoiceModal(false);
    setIsSending(true);

    try {
      const resp = await api.simulateWhatsAppTurn({
        phone_number: phoneNumber,
        farmer_state: farmerState,
        language: language,
        input_type: 'VOICE_NOTE',
        voice_audio_note: voiceInput
      });

      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: resp.bot_response_text || (resp.outgoing_messages ? resp.outgoing_messages[0] : ''),
        timestamp: getCurrentTime(),
        voiceAnalysis: resp.voice_analysis
      };

      setMessages((prev) => [...prev, botMsg]);
      await loadSession();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Trigger Evening Agro-Chrono Nudge
  const handleTriggerEveningNudge = async () => {
    if (isSending) return;
    setIsSending(true);

    try {
      const resp = await api.simulateWhatsAppTurn({
        phone_number: phoneNumber,
        farmer_state: farmerState,
        language: language,
        input_type: 'TRIGGER_NUDGE'
      });

      const nudgeContent = resp.bot_response_text || (resp.outgoing_messages ? resp.outgoing_messages[0] : '');
      const botMsg: ChatMessage = {
        id: String(Date.now()),
        sender: 'bot',
        text: `🌙 [7:30 PM Agro-Chrono Nudge]: ${nudgeContent}`,
        timestamp: '7:30 PM',
        buttons: resp.quick_reply_buttons
      };

      setMessages((prev) => [...prev, botMsg]);
      await loadSession();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Reset Session
  const handleResetSession = async () => {
    try {
      await api.resetFarmerSession(phoneNumber);
      setMessages([
        {
          id: String(Date.now()),
          sender: 'bot',
          text: '🔄 सत्र रीसेट हो गया है। आप नया प्रश्न पूछ सकते हैं।',
          timestamp: getCurrentTime()
        }
      ]);
      await loadSession();
    } catch (e: any) {
      alert(`Could not reset session: ${e.message}`);
    }
  };

  const sampleQueries = [
    { title: 'गेहूं में माहू कीट की दवा', text: 'गेहूं में माहू कीट की दवा बताएं' },
    { title: 'धान में खैरा रोग उपचार', text: 'धान में खैरा रोग (जिंक की कमी) का उपचार कैसे करें?' },
    { title: 'सरसों में सफेद रतुआ', text: 'सरसों में सफेद रतुआ रोग के लिए कौन सी दवा डालें?' },
    { title: 'कपास में गुलाबी सुंडी', text: 'कपास में गुलाबी सुंडी से बचाव के क्या उपाय हैं?' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-400 shrink-0" size={20} />
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-white">Backend Server Offline:</span> The WhatsApp AI agent simulation, audio transcription, and feedback loop require the FastAPI backend service to be running (<code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-300">uv run python run_backend.py</code>).
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6 items-start">
        {/* LEFT: WhatsApp Phone Frame */}
        <div className="bg-[#0c1317] rounded-[32px] border-[8px] border-slate-800 shadow-2xl shadow-emerald-500/10 flex flex-col h-[740px] overflow-hidden relative">
        {/* WhatsApp Phone Top Bar */}
        <div className="bg-[#202c33] p-3.5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-lg">
              🌱
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-[#e9edef]">AjraSakha Krishi</span>
                <span className="text-[#00a884] text-xs" title="Verified Agri Advisor">✓</span>
              </div>
              <div className="text-[11px] text-[#8696a0] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] inline-block" />
                online • 2-Turn Quality Bot
              </div>
            </div>
          </div>

          <button
            onClick={handleResetSession}
            className="bg-white/10 hover:bg-white/15 text-[#8696a0] hover:text-white p-2 rounded-full cursor-pointer transition-colors"
            title="Reset Farmer Session to IDLE"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* WhatsApp Chat Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#0b141a] bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px]">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`max-w-[85%] flex flex-col gap-1.5 ${isUser ? 'self-end' : 'self-start'}`}
              >
                {/* Chat Bubble */}
                <div
                  className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md break-words ${
                    isUser 
                      ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' 
                      : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'
                  } ${msg.isVoice ? 'border border-sky-400' : ''}`}
                >
                  {msg.isVoice && (
                    <div className="flex items-center gap-1 text-sky-400 text-[11px] mb-1 font-bold">
                      <Volume2 size={12} /> INDIC VOICE NOTE
                    </div>
                  )}
                  <div>{msg.text}</div>
                  <div className="flex justify-end items-center gap-1 text-[10px] text-[#8696a0] mt-1">
                    <span>{msg.timestamp}</span>
                    {isUser && <CheckCheck size={13} className="text-[#53bdeb]" />}
                  </div>
                </div>

                {/* Voice NLP Analysis Banner */}
                {msg.voiceAnalysis && (
                  <div className="bg-sky-500/10 border border-sky-500/30 p-2.5 rounded-xl text-xs">
                    <div className="text-sky-400 font-bold mb-0.5">
                      🎙️ Voice NLP Sentiment Detected:
                    </div>
                    <div className={`font-bold ${msg.voiceAnalysis.sentiment === 'POSITIVE' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {msg.voiceAnalysis.sentiment} ({msg.voiceAnalysis.rating === 1 ? '👍 Helpful' : '👎 Not Helpful'})
                    </div>
                  </div>
                )}

                {/* 1-Tap Quick Reply Buttons */}
                {msg.buttons && msg.buttons.length > 0 && (
                  <div className="flex gap-2 mt-1">
                    {msg.buttons.map((btn) => {
                      const btnVal = btn.value ?? btn.payload ?? 1;
                      return (
                        <button
                          key={btn.id || btn.title}
                          onClick={() => handleButtonClick(btnVal, btn.title)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                            btnVal === 1 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30' 
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                          }`}
                        >
                          {btnVal === 1 ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}
                          <span>{btn.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Root Cause Options (when downvoted) */}
                {msg.rootCauses && msg.rootCauses.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1.5">
                    <span className="text-[11px] text-amber-400 font-semibold">
                      कृपया समस्या का कारण चुनें:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.rootCauses.map((rc) => {
                        const code = rc.id || rc.code || '';
                        const label = rc.label || rc.label_hi || rc.label_en || '';
                        return (
                          <button
                            key={code}
                            onClick={() => handleSelectRootCause(code, label)}
                            className="bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 px-2.5 py-1 rounded-md text-xs cursor-pointer text-left"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* WhatsApp Chat Input Footer */}
        <div className="bg-[#202c33] p-2.5 flex items-center gap-2 border-t border-white/10">
          <button
            onClick={() => setShowVoiceModal(true)}
            className="bg-purple-500/20 border border-purple-500/40 hover:bg-purple-500/30 text-purple-300 p-2 rounded-full cursor-pointer transition-colors"
            title="Send Indic Voice Note"
          >
            <Mic size={17} />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Type query in Hindi/English..."
            className="flex-1 bg-[#2a3942] border-none rounded-xl px-3.5 py-2 text-sm text-[#e9edef] focus:outline-none placeholder:text-[#8696a0]"
          />

          <button
            onClick={() => handleSendText()}
            disabled={!inputText.trim() || isSending}
            className="bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-40 text-white p-2 rounded-full cursor-pointer transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* RIGHT: Simulator Controls, Session Inspector & Presets */}
      <div className="flex flex-col gap-5">
        {/* Simulation Controls Panel */}
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Smartphone size={18} className="text-emerald-400" />
            <div>
              <h3 className="font-bold text-base text-white">WhatsApp Feedback Pipeline Controls</h3>
              <p className="text-xs text-slate-400">Configure simulated farmer profile & triggers</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Farmer Phone Number
              </label>
              <input
                type="text"
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                State / Region
              </label>
              <select
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={farmerState}
                onChange={(e) => setFarmerState(e.target.value)}
              >
                <option value="Punjab">Punjab (Agri Cluster)</option>
                <option value="Haryana">Haryana (Wheat/Mustard)</option>
                <option value="Rajasthan">Rajasthan (Mustard/Gram)</option>
                <option value="Uttar Pradesh">Uttar Pradesh (Sugarcane/Paddy)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Language
              </label>
              <select
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="hi">Hindi (हिंदी)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="mb-4">
            <span className="text-xs font-semibold text-slate-400 block mb-2">
              One-Click Farmer Query Presets:
            </span>
            <div className="flex flex-wrap gap-2">
              {sampleQueries.map((q) => (
                <button
                  key={q.title}
                  onClick={() => handleSendText(q.text)}
                  disabled={isSending}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-3 py-1.5 rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Sparkles size={12} className="text-emerald-400" />
                  <span>{q.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Evening Agro-Chrono Scheduling Simulation */}
          <div className="bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-xl flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-bold text-sm text-emerald-400 flex items-center gap-1.5">
                <Clock size={16} /> Agro-Chrono Evening Leisure Nudge
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                Simulates 7:00 PM - 9:00 PM scheduled feedback check if farmer was busy during fieldwork.
              </div>
            </div>
            <button
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition-all shadow-md shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
              onClick={handleTriggerEveningNudge}
              disabled={isSending}
            >
              Send Nudge
            </button>
          </div>
        </div>

        {/* Live Session State Inspector */}
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={17} className="text-sky-400" />
              <div>
                <h4 className="font-bold text-sm text-white">Active Farmer Session State</h4>
                <p className="text-[11px] text-slate-400">State machine in MongoDB collection `farmer_sessions`</p>
              </div>
            </div>

            <button
              onClick={handleResetSession}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
            >
              Reset Session
            </button>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl font-mono text-xs border border-white/10 grid grid-cols-[130px_1fr] gap-2">
            <span className="text-slate-400">Phone Number:</span>
            <span className="text-slate-100">{phoneNumber}</span>

            <span className="text-slate-400">FSM State:</span>
            <span className="text-emerald-400 font-bold">{session?.current_state || 'IDLE'}</span>

            <span className="text-slate-400">Active GDB ID:</span>
            <span className="text-sky-400">{session?.active_gdb_id || 'None'}</span>

            <span className="text-slate-400">Nudge Scheduled:</span>
            <span className={session?.nudge_scheduled ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
              {session?.nudge_scheduled ? 'YES (Pending Evening Window)' : 'NO'}
            </span>

            <span className="text-slate-400">Last Query:</span>
            <span className="text-slate-200 truncate">{session?.last_query || '—'}</span>
          </div>
        </div>
      </div>

      {/* Voice Note Simulation Modal */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full shadow-2xl p-6 modal-scale-up">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Mic size={18} className="text-purple-400" />
                <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-white">
                  Simulate Indic Voice Note (Audio NLP)
                </h3>
              </div>
              <button 
                onClick={() => setShowVoiceModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3.5">
              Simulates farmer sending a voice note in Hindi or Punjabi. Backend NLP analyzes sentiment, rating, and root-causes.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-purple-300 mb-1.5">
                Quick Audio Presets:
              </label>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setVoiceInput('ਦਵਾਈ ਬਹੁਤ ਵਧੀਆ ਸੀ, ਕਣਕ ਨੂੰ ਬਹੁਤ ਫਾਇਦਾ ਹੋਇਆ ਧੰਨਵਾਦ')}
                  className="text-left bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 p-2 rounded-lg text-xs cursor-pointer"
                >
                  🟢 Punjabi Positive: "ਦਵਾਈ ਬਹੁਤ ਵਧੀਆ ਸੀ, ਕਣਕ ਨੂੰ ਬਹੁਤ ਫਾਇਦਾ ਹੋਇਆ ਧੰਨਵਾਦ"
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceInput('दवा डालने के बाद भी कीड़े नहीं मरे, पूरे पैसे बर्बाद हो गए')}
                  className="text-left bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 p-2 rounded-lg text-xs cursor-pointer"
                >
                  🔴 Hindi Negative: "दवा डालने के बाद भी कीड़े नहीं मरे, पूरे पैसे बर्बाद हो गए"
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceInput('यह दवा कितने पानी में मिलानी है यह साफ नहीं बताया')}
                  className="text-left bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 p-2 rounded-lg text-xs cursor-pointer"
                >
                  🟡 Hindi Dosage Complaint: "यह दवा कितने पानी में मिलानी है यह साफ नहीं बताया"
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Audio Transcript Text
              </label>
              <textarea
                className="w-full bg-slate-950 border border-white/15 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[70px]"
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-4 py-2 rounded-lg border border-white/10 transition-all cursor-pointer"
                onClick={() => setShowVoiceModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-purple-600/30 cursor-pointer"
                onClick={handleSendVoiceNote}
              >
                <Mic size={15} />
                <span>Process Voice Note</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
