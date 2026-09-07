import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapPin, Sprout, CloudRain, ShieldAlert, Send, Activity, Languages, Bot, Droplets, Thermometer, Map, Sun, Waves } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';

// Fix leaflet icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationPicker({ location, setLocation }: { location: {lat: number, lon: number} | null, setLocation: (loc: {lat: number, lon: number}) => void }) {
  useMapEvents({
    click(e) {
      setLocation({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return location ? <Marker position={[location.lat, location.lon]} /> : null;
}

export default function App() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('en-IN');
  const [loading, setLoading] = useState(false);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [history, setHistory] = useState<{query: string, result: any}[]>([]);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(true);
  const [pendingQuery, setPendingQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => setError("Please allow location access or pick a location on the map.")
      );
    } else {
      setError("Geolocation is not supported.");
    }
    
    // Request notification permissions for admin escalations
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Fetch telemetry when location changes
  useEffect(() => {
    const fetchTelemetry = async () => {
      if (!location) return;
      setTelemetryLoading(true);
      try {
        const res = await axios.get(`http://localhost:8000/api/telemetry?lat=${location.lat}&lon=${location.lon}`);
        setTelemetry(res.data);
      } catch (e) {
        console.error("Failed to fetch telemetry", e);
      } finally {
        setTelemetryLoading(false);
      }
    };
    fetchTelemetry();
  }, [location]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, loading, telemetryLoading]);

  // Poll for admin answers on escalated queries
  useEffect(() => {
    const checkEscalations = async () => {
      let updated = false;
      const newHistory = await Promise.all(history.map(async (item) => {
        const llm = item.result.llm_response;
        if (llm?.status === 'escalated' && llm?.escalation_id && !llm?.admin_answer) {
          try {
            const res = await axios.get(`http://localhost:8000/api/escalation/${llm.escalation_id}`);
            if (res.data.status === 'answered' && res.data.answer) {
              updated = true;
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification("Agronomist Replied!", {
                  body: "An expert has answered your escalated question."
                });
              }
              return {
                ...item,
                result: {
                  ...item.result,
                  llm_response: {
                    ...llm,
                    admin_answer: res.data.answer
                  }
                }
              };
            }
          } catch (e) {
            console.error("Polling error", e);
          }
        }
        return item;
      }));

      if (updated) {
        setHistory(newHistory);
      }
    };

    const interval = setInterval(checkEscalations, 5000);
    return () => clearInterval(interval);
  }, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      setError("Waiting for location data...");
      return;
    }
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    const currentQuery = query;
    setPendingQuery(currentQuery);
    setQuery('');

    try {
      const formattedHistory = history.map(h => ({
        user_query: h.query,
        ai_response: h.result.llm_response?.answer
      }));

      const res = await axios.post('http://localhost:8000/api/query', {
        query: currentQuery,
        latitude: location.lat,
        longitude: location.lon,
        language,
        satellite: telemetry?.satellite,
        weather: telemetry?.weather,
        chat_history: formattedHistory
      });
      setHistory(prev => [...prev, { query: currentQuery, result: res.data }]);
      setShowMap(false); 
    } catch (err: any) {
      setError(err.response?.data?.detail || "An error occurred connecting to the server.");
    } finally {
      setLoading(false);
      setPendingQuery("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex justify-center selection:bg-emerald-500/30">
      
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20"></div>
      </div>

      <div className="w-full max-w-2xl flex flex-col h-screen relative z-10 p-2 md:p-6">
        
        <header className="flex items-center justify-between p-4 backdrop-blur-xl bg-slate-800/40 border border-slate-700/50 rounded-2xl shadow-xl mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sprout className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">
                Ajrasakha
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium cursor-pointer hover:text-emerald-400 transition-colors" onClick={() => setShowMap(!showMap)}>
                <MapPin className="w-3 h-3" />
                {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Set Location'}
                <Map className="w-3 h-3 ml-1" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <Languages className="w-4 h-4 text-slate-400 ml-2" />
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-200 focus:outline-none appearance-none pr-4 pl-1 py-1 cursor-pointer"
            >
              <option value="en-IN" className="bg-slate-800">English</option>
              <option value="hi-IN" className="bg-slate-800">Hindi</option>
              <option value="mr-IN" className="bg-slate-800">Marathi</option>
              <option value="pa-IN" className="bg-slate-800">Punjabi</option>
            </select>
          </div>
        </header>

        {error && (
          <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-red-500/10 text-red-400 p-3 rounded-xl text-sm mb-4 border border-red-500/20 shrink-0 backdrop-blur-md flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}

        <AnimatePresence>
          {showMap && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: '200px', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="rounded-2xl overflow-hidden mb-4 shrink-0 relative z-0 shadow-lg border border-slate-700/50 origin-top"
            >
              <MapContainer 
                center={location ? [location.lat, location.lon] : [20.5937, 78.9629]}
                zoom={location ? 13 : 4} 
                style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationPicker location={location} setLocation={setLocation} />
              </MapContainer>
              <div className="absolute top-2 right-2 z-[1000] bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 border border-slate-700/50 pointer-events-none">
                Tap map to set farm
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Live Telemetry Dashboard */}
        {location && (
          <div className="flex gap-2 justify-start items-center mb-4 overflow-x-auto custom-scrollbar pb-1 shrink-0 px-1">
            {telemetryLoading ? (
              <div className="text-xs text-emerald-500/70 animate-pulse flex items-center gap-2 px-2">
                <MapPin className="w-3 h-3" /> Fetching live satellite telemetry for this location...
              </div>
            ) : telemetry ? (
              <>
                {telemetry.satellite && !telemetry.satellite.error && (
                  <>
                    <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.1}} 
                      className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                      <div className="bg-blue-500/20 p-2 rounded-lg">
                        <Droplets className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Moisture</p>
                        <p className="text-sm font-bold text-slate-200">{telemetry.satellite.soil_moisture?.toFixed(1)}%</p>
                      </div>
                    </motion.div>
                    
                    <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.2}}
                      className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                      <div className="bg-emerald-500/20 p-2 rounded-lg">
                        <Activity className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Crop Health</p>
                        <p className="text-sm font-bold text-slate-200">{telemetry.satellite.ndvi?.toFixed(2)} NDVI</p>
                      </div>
                    </motion.div>

                    {telemetry.satellite.lst !== undefined && telemetry.satellite.lst !== null && (
                      <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.3}}
                        className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                        <div className="bg-orange-500/20 p-2 rounded-lg">
                          <Sun className="w-4 h-4 text-orange-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Land Temp</p>
                          <p className="text-sm font-bold text-slate-200">{telemetry.satellite.lst?.toFixed(1)}°C</p>
                        </div>
                      </motion.div>
                    )}

                    <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.4}}
                      className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                      <div className="bg-cyan-500/20 p-2 rounded-lg">
                        <Waves className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Water Index</p>
                        <p className="text-sm font-bold text-slate-200">{telemetry.satellite.ndwi?.toFixed(2)} NDWI</p>
                      </div>
                    </motion.div>

                    {telemetry.satellite.average_rainfall !== undefined && telemetry.satellite.average_rainfall !== null && (
                      <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.5}}
                        className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                        <div className="bg-indigo-500/20 p-2 rounded-lg">
                          <CloudRain className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Avg Rainfall</p>
                          <p className="text-sm font-bold text-slate-200">{telemetry.satellite.average_rainfall?.toFixed(1)} mm/day</p>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}
                {telemetry.satellite && telemetry.satellite.error && (
                   <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.1}} 
                     className="bg-slate-800/60 backdrop-blur-md border border-red-900/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                     <div className="bg-red-500/20 p-2 rounded-lg">
                       <ShieldAlert className="w-4 h-4 text-red-400" />
                     </div>
                     <div>
                       <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Satellite Error</p>
                       <p className="text-xs font-bold text-red-400">{telemetry.satellite.error.replace('Failed: ', '')}</p>
                     </div>
                   </motion.div>
                )}
                {telemetry.weather?.forecast?.[0] && (
                  <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{delay:0.3}}
                    className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm min-w-max">
                    <div className="bg-amber-500/20 p-2 rounded-lg">
                      <Thermometer className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Weather</p>
                      <p className="text-sm font-bold text-slate-200 capitalize">
                        {telemetry.weather.forecast[0].temp}°C, {telemetry.weather.forecast[0].weather}
                      </p>
                    </div>
                  </motion.div>
                )}
              </>
            ) : null}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto mb-4 space-y-6 px-1 custom-scrollbar pb-4">
          
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-medium text-slate-300">Ready to Assist</h3>
              <p className="text-sm text-slate-500 max-w-xs mt-2">Ask me about crops, diseases, or practices. I'll analyze satellite data and verify with ICAR texts.</p>
            </div>
          )}

          {history.map((item, idx) => (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={idx} className="space-y-4">
              
              <div className="flex justify-end">
                <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-md">
                  <p className="text-[15px] leading-relaxed">{item.query}</p>
                </div>
              </div>

              <div className="flex justify-start">
                <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700/50 px-5 py-4 rounded-2xl rounded-tl-sm max-w-[90%] shadow-lg">
                  {item.result.llm_response?.status === 'escalated' ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 font-bold text-amber-400 border-b border-amber-500/20 pb-2">
                        <ShieldAlert className="w-5 h-5" /> Escalation Triggered
                      </div>
                      <p className="text-[15px] leading-relaxed text-slate-300">{item.result.llm_response.answer}</p>
                      
                      {item.result.llm_response?.admin_answer && (
                        <div className="mt-2 bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-4">
                          <div className="flex items-center gap-2 font-bold text-emerald-400 mb-2">
                            <Bot className="w-5 h-5" /> Expert Agronomist Answer
                          </div>
                          <p className="text-[15px] leading-relaxed text-slate-200">{item.result.llm_response.admin_answer}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-[15px] leading-relaxed text-slate-200 whitespace-pre-wrap">{item.result.llm_response?.answer}</p>
                      
                      {/* Citation UI */}
                      <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium uppercase tracking-wide">
                        <div className="flex items-center gap-1.5 bg-slate-900/50 px-2 py-1 rounded border border-slate-700/50">
                          <span className="text-slate-500">Verified By:</span> 
                          <span className={item.result.llm_response?.source?.includes('ICAR') || item.result.llm_response?.source?.includes('Golden') ? 'text-emerald-400 font-bold' : 'text-blue-400 font-bold'}>
                            {item.result.llm_response?.source || 'AI Generation'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <MapPin className="w-3 h-3" /> Based on live {location?.lat.toFixed(2)}, {location?.lon.toFixed(2)} data
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {loading && pendingQuery && (
             <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="space-y-4">
               <div className="flex justify-end">
                 <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-md">
                   <p className="text-[15px] leading-relaxed">{pendingQuery}</p>
                 </div>
               </div>
               <div className="flex justify-start">
                 <div className="bg-slate-800/50 backdrop-blur-md border border-slate-700/50 px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm flex gap-2 items-center">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                 </div>
               </div>
             </motion.div>
          )}

        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="relative mt-auto shrink-0 pb-2">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full blur opacity-20 transition-opacity"></div>
          <div className="relative flex items-center bg-slate-800 border border-slate-700 rounded-full p-1.5 shadow-xl transition-all focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your farm..."
              className="w-full bg-transparent py-3 pl-5 pr-2 text-[15px] text-slate-200 placeholder-slate-400 focus:outline-none"
              disabled={loading || !location}
            />
            <button 
              type="submit" 
              disabled={loading || !location || !query.trim()}
              className="bg-emerald-500 text-white p-3 rounded-full hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500 shrink-0"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
        </form>

      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #334155;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
