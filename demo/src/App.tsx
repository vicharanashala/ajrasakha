import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, SquarePen,
   ArrowUp, Lightbulb, Volume2, Copy, PencilLine, 
  Network, ThumbsUp, ThumbsDown, RefreshCcw, Share2, 
  Sun, Moon,Leaf, MoreHorizontal,
  MessageCircle, LayoutList, Briefcase, CloudSun, X, ArrowUpRight, CodeXml
} from 'lucide-react';

// --- Types ---
type Role = 'user' | 'bot';

interface Message {
  id: string;
  role: Role;
  content: string;
  thoughts?: string;
}

interface ChatHistoryItem {
  id: string;
  title: string;
  date: string; // 'Today', 'Yesterday', 'Previous 7 days', etc.
}

// --- Mock Data ---
const initialHistory: ChatHistoryItem[] = [
  { id: '1', title: 'Paddy Harvest Timing Advice', date: 'Yesterday' },
  { id: '2', title: 'Rice Blast Disease Treatment', date: 'Yesterday' },
  { id: '3', title: 'Best Fertilizer for Paddy Growth', date: 'Yesterday' },
  { id: '4', title: 'Soil NPK Levels Improvement Tips', date: 'Previous 7 days' },
  { id: '5', title: 'Yellow Leaves in Wheat Causes', date: 'Previous 7 days' },
  { id: '6', title: 'Organic Farming Methods for Vegetables', date: 'Previous 7 days' },
  { id: '7', title: 'Weather Forecast for Crop Planning', date: 'Previous 7 days' },
  { id: '8', title: 'Current Market Price of Tomatoes', date: 'Previous 7 days' },
  { id: '9', title: 'Crop Rotation Benefits Explained', date: 'Previous 30 days' },
];

const SUGGESTIONS = [
  "What are the best practices for wheat farming?",
  "How to treat yellow leaves in paddy?",
  "Check current market price for potatoes.",
  "What is the weather forecast for my farm?",
  "What are the best fertilizers for coconut farming?",
"How to control pests in vegetable crops?"
];

// --- Custom Components ---

// AjraSakha Logo Icon
const BrandIcon = ({ className = "w-6 h-6 text-[#10a37f]" }) => (
  <div className={`relative flex items-center justify-center rounded-full p-0.5 ${className}`}>
    <img src="/logo.png" alt="AjraSakha Logo" className='w-full h-full object-contain' />
  </div>
);

// mock response generator based on title keywords for demonstration purposes
const getMockResponse = (title: string) => {
  const t = title.toLowerCase();

  if (t.includes('paddy harvest')) {
    return "Paddy should be harvested when 80–85% of the grains turn golden yellow. Ensure moisture content is around 20–25% to avoid grain breakage. Timely harvesting improves yield and quality.";
  } 
  else if (t.includes('rice blast')) {
    return "Rice blast disease can be controlled by using resistant varieties and applying fungicides like Tricyclazole. Maintain proper spacing and avoid excess nitrogen fertilizer.";
  } 
  else if (t.includes('fertilizer for paddy')) {
    return "For paddy, apply a balanced dose of NPK (Nitrogen, Phosphorus, Potassium). Split nitrogen application into stages—basal, tillering, and panicle initiation—for best results.";
  } 
  else if (t.includes('soil npk')) {
    return "Improving soil NPK levels can be done by adding organic compost, green manure, and balanced fertilizers. Soil testing is recommended before application.";
  } 
  else if (t.includes('yellow leaves in wheat')) {
    return "Yellowing in wheat may be due to nitrogen deficiency or fungal infection. Apply urea if deficiency is confirmed, and ensure proper drainage to prevent disease.";
  } 
  else if (t.includes('organic farming')) {
    return "Organic farming involves using natural inputs like compost, vermicompost, and biofertilizers. Crop rotation and biological pest control are key practices.";
  } 
  else if (t.includes('weather')) {
    return "Weather plays a crucial role in farming. Monitor rainfall and temperature regularly to plan irrigation, fertilization, and harvesting activities effectively.";
  } 
  else if (t.includes('market price')) {
    return "Market prices vary by mandi and quality. It is advisable to check nearby markets or government portals like Agmarknet for real-time pricing before selling.";
  } 
  else if (t.includes('crop rotation')) {
    return "Crop rotation improves soil fertility and reduces pests. Rotating legumes with cereals helps fix nitrogen and improves overall yield.";
  } 
  else {
    return "This is a previous farming-related discussion. Let me know if you want updated advice based on your current crop conditions.";
  }
};

export default function App() {
  // --- State ---
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [newChatKey, setNewChatKey] = useState(Date.now());
  
  // Track chat history dynamically
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>(initialHistory);
  // Store messages for specific chat IDs to keep them in memory during session
  const [savedChats, setSavedChats] = useState<Record<string, Message[]>>({});
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Handlers ---
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle responsive sidebar on mount and resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);



  const loadChat = (id: string, title: string) => {
    setActiveChatId(id);
    
    // If we have saved messages for this session, load them
    if (savedChats[id]) {
      setMessages(savedChats[id]);
    } else {
      // Otherwise, generate a mock static answer for existing history items
     const mockMsgs: Message[] = [
  { id: `mock-user-${id}`, role: 'user', content: `I need information regarding: ${title}` },
  { 
    id: `mock-bot-${id}`, 
    role: 'bot', 
    content: getMockResponse(title),
    thoughts: `Fetching farming insights related to: ${title}`
  }
];
      setMessages(mockMsgs);
      setSavedChats(prev => ({ ...prev, [id]: mockMsgs }));
    }
    
    // Close sidebar on mobile after selection
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSendMessage = (e?: React.FormEvent, textOverride?: string) => {
    if (e) e.preventDefault();
    const text = textOverride || inputValue.trim();
    if (!text) return;

    // Add user message
    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setInputValue('');

    let currentChatId = activeChatId;

    // If this is the very first message in the window, create a new chat history item
    if (!currentChatId) {
      currentChatId = `chat-${Date.now()}`;
      setActiveChatId(currentChatId);
      
      const newHistoryItem: ChatHistoryItem = {
        id: currentChatId,
        title: text.length > 25 ? text.substring(0, 25) + '...' : text,
        date: 'Today'
      };
      
      setChatHistory(prev => [newHistoryItem, ...prev]);
    }

    // Save current user message into session storage
    setSavedChats(prev => ({ ...prev, [currentChatId as string]: newMessages }));

    // Simulate bot thinking and replying
    setTimeout(() => {
      let botResponse = "";
      let thoughts = "";

      if (text.toLowerCase().includes('hi') || text.toLowerCase().includes('hello')) {
        botResponse = "Hello! 🌿 How can I assist you today? I'm here to help with agriculture-related queries in India. Whether it's about crops, soil, pests, or farming techniques, feel free to ask!";
        thoughts = "The user said hello. I should greet them warmly and explain my purpose as an agricultural assistant.";
      } else if (text.toLowerCase().includes('weather')) {
        botResponse = "Based on your location, it is currently sunny with a high of 32°C. There is a 10% chance of rain in the next 48 hours. Good conditions for applying fertilizer if needed.";
      } else if (text.toLowerCase().includes('price')) {
        botResponse = "The current average mandi price for potatoes in your region is approximately ₹1,200 to ₹1,400 per quintal. Prices may vary slightly based on quality and specific local markets.";
      } else {
        botResponse = "I understand you're asking about farming. To give you the most accurate advice, could you provide a bit more detail? For example, your crop type, soil condition, or specific symptoms if you're asking about a disease.";
        thoughts = "The query is generic or I lack specific context. I need to prompt the user for more information to provide a helpful answer.";
      }

      const newBotMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: botResponse,
        thoughts: thoughts,
      };
      
      // Update active messages and save to session history simultaneously
      setMessages(prev => {
        const updatedMsgs = [...prev, newBotMsg];
        setSavedChats(sc => ({ ...sc, [currentChatId as string]: updatedMsgs }));
        return updatedMsgs;
      });
      
    }, 1000);
  };

  const startNewChat = () => {
    setMessages([]);
    setActiveChatId(null);
    setNewChatKey(Date.now()); // Update key to trigger animation
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // Group history by date dynamically from state
  const groupedHistory = chatHistory.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, ChatHistoryItem[]>);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="flex h-screen w-full bg-white dark:bg-[#212121] text-gray-800 dark:text-gray-200 font-sans overflow-hidden transition-colors duration-200">
        
        {/* Mobile Sidebar Backdrop */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/40 dark:bg-black/60 z-30 md:hidden transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* --- Sidebar --- */}
        <aside 
          className={`fixed md:relative z-40 h-full w-64 flex-shrink-0 bg-[#f9f9f9] dark:bg-[#171717] flex flex-col border-r border-gray-200 dark:border-[#2f2f2f] transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'translate-x-0 ml-0' : '-translate-x-full md:translate-x-0 md:-ml-64'
          }`}
        >
          {/* Sidebar Header */}
          <div className="p-3 flex items-center justify-between sticky top-0 z-10 bg-[#f9f9f9] dark:bg-[#171717]">
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-gray-200 dark:hover:bg-[#2f2f2f] rounded-md transition-colors text-gray-600 dark:text-gray-400"
              title="Close sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button 
              onClick={startNewChat}
              className="p-2 hover:bg-gray-200 dark:hover:bg-[#2f2f2f] rounded-md transition-colors text-gray-600 dark:text-gray-400"
              title="New Chat"
            >
              <SquarePen className="w-5 h-5" />
            </button>
          </div>

          {/* Chat History List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4 custom-scrollbar">
            {Object.entries(groupedHistory).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2">
                  {date}
                </h3>
                <div className="space-y-1">
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => loadChat(item.id, item.title)}
                      className={`w-full text-left px-2 py-2 rounded-lg flex items-center gap-2 text-sm group hover:bg-gray-200 dark:hover:bg-[#2f2f2f] transition-colors ${
                        activeChatId === item.id ? 'bg-gray-200 dark:bg-[#2f2f2f]' : ''
                      }`}
                    >
                      <BrandIcon className="w-7 h-7 text-[#10a37f] flex-shrink-0" />
                      <span className="truncate flex-1 text-gray-700 dark:text-gray-300">{item.title}</span>
                      {activeChatId === item.id && (
                        <MoreHorizontal className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* User Profile Area */}
          <div className="p-3 border-t border-gray-200 dark:border-[#2f2f2f] mt-auto">
            <button className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-200 dark:hover:bg-[#2f2f2f] rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full bg-pink-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                DM
              </div>
              <span className="text-sm font-medium truncate flex-1 text-left text-gray-700 dark:text-gray-300">Demo</span>
            </button>
          </div>
        </aside>

        {/* --- Main Content Area --- */}
        <main className="flex-1 flex flex-col relative min-w-0">
          
          {/* Top Bar */}
          <header className="h-14 flex items-center justify-between px-4 border-b border-transparent shrink-0">
            <div className="flex items-center gap-2">
              {/* Toggle Sidebar Button (Visible when sidebar is closed) */}
              {!isSidebarOpen && (
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-[#2f2f2f] rounded-md transition-colors text-gray-600 dark:text-gray-400"
                  title="Open sidebar"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="p-2 hover:bg-gray-100 dark:hover:bg-[#2f2f2f] rounded-full text-gray-500 transition-colors"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {messages.length > 0 &&
                 <button className="p-2 hover:bg-gray-100 dark:hover:bg-[#2f2f2f] rounded-full text-gray-500 transition-colors">
                   <Share2 className="w-5 h-5" />
                 </button>
              }
            </div>
          </header>

          {/* Spacer above when empty to center content */}
          {messages.length === 0 && <div className="flex-1" />}

          {/* Chat Messages Area */}
          <div className={messages.length === 0 ? "w-full" : "flex-1 overflow-y-auto"}>
            {messages.length === 0 ? (
              // Welcome Screen
              <div key={newChatKey} className="w-full flex flex-col items-center px-4 mb-6">
                <div className="flex items-center justify-center gap-3 md:gap-4">
                  <BrandIcon className="w-10 mt-2 h-10 md:w-12 md:h-12 text-[#10a37f] opacity-0 animate-logo-reveal" />
                  {/* Removed static tailwind text colors here, relying entirely on the CSS animation variables */}
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-center flex">
                    {"Welcome to AjraSakha!".split("").map((char, idx) => (
                      <span 
                        key={idx} 
                        className="inline-block opacity-0 animate-text-reveal-seq"
                        style={{ 
                          animationDelay: `${idx * 0.04}s` 
                        }}
                      >
                        {char === " " ? "\u00A0" : char}
                      </span>
                    ))}
                  </h1>
                </div>
              </div>
            ) : (
              // Active Chat List
              <div className="w-full max-w-3xl mx-auto py-6 px-4 space-y-6">
                {messages.map((msg, _) => (
                  <div key={msg.id} className="w-full">
                    {msg.role === 'user' ? (
                      // User Message
                      <div className="flex gap-4 mb-4 items-start">
                        <div className="w-8 h-8 rounded bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-1">
                          DM
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-[15px] mb-1 text-gray-800 dark:text-gray-100">Demo</h4>
                          <div className="text-[15px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Bot Message
                      <div className="flex gap-4 items-start">
                        <BrandIcon className="w-8 h-8 text-[#10a37f] flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-[15px] mb-1 text-gray-800 dark:text-gray-100">AjraSakha</h4>
                          
                          {/* Thoughts Toggle */}
                          {msg.thoughts && (
                            <div className="mb-3">
                              <button 
                                onClick={() => setShowThoughts(!showThoughts)}
                                className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
                              >
                                <Lightbulb className={`w-4 h-4 ${showThoughts ? 'text-yellow-500' : ''}`} />
                                Thoughts
                              </button>
                              {showThoughts && (
                                <div className="mt-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 italic">
                                  {msg.thoughts}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Main Response content */}
                          <div className="text-[15px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </div>

                          {/* Action Bar */}
                          <div className="flex items-center gap-1 mt-3">
                            {[Volume2, Copy, PencilLine, Network, ThumbsUp, ThumbsDown, RefreshCcw].map((Icon, i) => (
                              <button key={i} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2f2f2f] rounded transition-colors">
                                <Icon className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={`w-full ${messages.length === 0 ? 'bg-transparent' : 'bg-gradient-to-t from-white via-white to-transparent dark:from-[#212121] dark:via-[#212121] dark:to-transparent'} pt-2 pb-4 px-4`}>
            <div className="max-w-3xl mx-auto w-full flex flex-col items-center">
              
              {/* Input Box Container */}
              <div className="w-full relative bg-white dark:bg-[#2f2f2f] border border-gray-300 dark:border-transparent rounded-[24px] shadow-sm hover:shadow-md transition-shadow focus-within:shadow-md focus-within:border-gray-400 dark:focus-within:border-[#444]">
                <form 
                  onSubmit={handleSendMessage}
                  className="flex flex-col w-full"
                >
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Message AjraSakha"
                    className="w-full max-h-48 resize-none bg-transparent outline-none pt-4 pb-2 px-4 text-gray-800 dark:text-gray-100 overflow-y-auto m-0 leading-relaxed placeholder-gray-400 dark:placeholder-gray-500"
                    rows={1}
                    style={{ minHeight: '52px' }}
                  />
                  
                  {/* Bottom Tool Row inside Input */}
                  <div className="flex items-center justify-between px-3 pb-3">
                    <div className="flex items-center gap-1">
                      {/* Empty left actions space for future buttons if needed */}
                    </div>

                    <div className="flex items-center gap-1">
                      <button 
                        type="submit" 
                        disabled={!inputValue.trim()}
                        className={`p-1.5 ml-1 rounded-full transition-colors ${
                          inputValue.trim() 
                            ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80' 
                            : 'bg-gray-200 text-gray-400 dark:bg-[#444] dark:text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <ArrowUp className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Suggestions (Visible only when chat is empty) */}
              {messages.length === 0 && (
                <div className="w-full mt-4 flex flex-col gap-3">

                  {/* Vertical Text Suggestions */}
                  <div className="flex flex-col items-start w-full">
                    {SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => setInputValue(suggestion)}
                        className="group flex items-center justify-between w-full text-left text-[14px] text-gray-600 dark:text-[#a0a0a0] hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2f2f2f] transition-all py-2.5 px-3 rounded-lg border border-transparent"
                      >
                        <span>{suggestion}</span>
                        <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-gray-400 dark:text-[#666] transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Links */}
              <div className="mt-6 flex flex-wrap gap-4 text-xs text-gray-400 justify-center pb-2">
                <a href="#" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">annam.ai</a>
                <span className="hidden sm:inline">|</span>
                <a href="#" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Privacy policy</a>
                <span className="hidden sm:inline">|</span>
                <a href="#" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Terms of service</a>
              </div>
            </div>
          </div>

          {/* Spacer below when empty to balance vertical centering */}
          {messages.length === 0 && <div className="flex-[1.2]" />}
        </main>
      </div>
      
      {/* Scrollbar & Animation styling */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          /* Light mode colors */
          --text-final: #374151; /* gray-700 */
          --text-flash: #000000; /* Pure black */
        }
        .dark {
          /* Dark mode colors */
          --text-final: #d1d5db; /* gray-300 (softer white so the flash is visible) */
          --text-flash: #ffffff; /* Pure white */
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #444;
        }
        
        /* Unified animation for both slide-up and color highlight */
        @keyframes textRevealSequence {
          0% { 
            opacity: 0; 
            transform: translateY(15px); 
            color: var(--text-flash); 
          }
          35% { 
            opacity: 1; 
            transform: translateY(0); 
            color: var(--text-flash); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0); 
            color: var(--text-final); 
          }
        }
        
        .animate-text-reveal-seq {
          animation: textRevealSequence 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        
        @keyframes logoReveal {
          0% { opacity: 0; transform: scale(0.8) rotate(-10deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        .animate-logo-reveal {
          animation: logoReveal 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
      `}} />
    </div>
  );
}