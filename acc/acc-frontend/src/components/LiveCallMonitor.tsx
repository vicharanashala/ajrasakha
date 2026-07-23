import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './atoms/card';
import { Button } from './atoms/button';
import { Badge } from './atoms/badge';
import { PlivoWebSocketService } from '../hooks/services/plivoWebSocketService';
import type { PlivoTranscriptMessage, ActiveCallItem } from '../hooks/services/plivoWebSocketService';
import { useLiveAudioPlayer } from '../hooks/useLiveAudioPlayer';
import { Volume2, VolumeX, Radio, Phone, User, Clock, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';

interface ChatBubble {
  id: string;
  callId: string;
  track: 'inbound' | 'outbound';
  originalText: string;
  translatedText: string;
  detectedLanguage?: string;
  timestamp: string;
}

interface LiveCallMonitorProps {
  wsService?: PlivoWebSocketService;
}

export const LiveCallMonitor: React.FC<LiveCallMonitorProps> = ({ wsService: customWsService }) => {
  const [wsService] = useState<PlivoWebSocketService>(() => customWsService || new PlivoWebSocketService());
  const [activeCalls, setActiveCalls] = useState<ActiveCallItem[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, ChatBubble[]>>({});
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});

  const { isPlaying, isMuted, volume, playChunk, setVolume, toggleMute, stop: stopAudio } = useLiveAudioPlayer(1.0);

  const transcriptsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll transcript view
  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, selectedCallId]);

  // Timer for duration counters
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes((prev) => {
        const next: Record<string, number> = {};
        activeCalls.forEach((call) => {
          const start = new Date(call.startTime).getTime();
          const now = Date.now();
          next[call.callId] = Math.max(0, Math.floor((now - start) / 1000));
        });
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCalls]);

  // Connect to WebSocket and setup listeners
  useEffect(() => {
    let isSubscribed = true;

    wsService.connect().then(() => {
      if (isSubscribed) {
        setIsWsConnected(true);
        wsService.requestActiveCalls();
      }
    }).catch((err) => {
      console.error('❌ Failed to connect WS for LiveCallMonitor:', err);
    });

    const handleActiveCallsList = (msg: PlivoTranscriptMessage) => {
      if (msg.activeCalls) {
        setActiveCalls(msg.activeCalls);
      }
    };

    const handleActiveCallStarted = (msg: PlivoTranscriptMessage) => {
      if (msg.callInfo) {
        setActiveCalls((prev) => {
          const exists = prev.some((c) => c.callId === msg.callInfo!.callId);
          if (exists) return prev;
          return [...prev, msg.callInfo!];
        });
      }
    };

    const handleActiveCallEnded = (msg: PlivoTranscriptMessage) => {
      if (msg.callId) {
        setActiveCalls((prev) => prev.filter((c) => c.callId !== msg.callId));
        if (selectedCallId === msg.callId) {
          setSelectedCallId(null);
          stopAudio();
        }
      }
    };

    const handleTranscript = (msg: PlivoTranscriptMessage) => {
      if (!msg.callId) return;
      const bubble: ChatBubble = {
        id: `${msg.callId}_${Date.now()}_${Math.random()}`,
        callId: msg.callId,
        track: msg.track || 'inbound',
        originalText: msg.originalText || msg.text || '',
        translatedText: msg.translatedText || '',
        detectedLanguage: msg.detectedLanguage,
        timestamp: msg.timestamp || new Date().toISOString(),
      };

      setTranscripts((prev) => {
        const list = prev[msg.callId] || [];
        return {
          ...prev,
          [msg.callId]: [...list, bubble],
        };
      });
    };

    const handleAudioChunk = (msg: PlivoTranscriptMessage) => {
      if (msg.callId === selectedCallId && msg.payload) {
        playChunk(msg.payload);
      }
    };

    wsService.onMessage('active_calls_list', handleActiveCallsList);
    wsService.onMessage('active_call_started', handleActiveCallStarted);
    wsService.onMessage('active_call_ended', handleActiveCallEnded);
    wsService.onMessage('transcript', handleTranscript);
    wsService.onMessage('live_audio_chunk', handleAudioChunk);

    return () => {
      isSubscribed = false;
      wsService.offMessage('active_calls_list', handleActiveCallsList);
      wsService.offMessage('active_call_started', handleActiveCallStarted);
      wsService.offMessage('active_call_ended', handleActiveCallEnded);
      wsService.offMessage('transcript', handleTranscript);
      wsService.offMessage('live_audio_chunk', handleAudioChunk);
    };
  }, [wsService, selectedCallId, playChunk, stopAudio]);

  const handleSelectCall = (callId: string) => {
    if (selectedCallId === callId) {
      // Toggle off
      wsService.unsubscribeLiveAudio(callId);
      setSelectedCallId(null);
      stopAudio();
    } else {
      if (selectedCallId) {
        wsService.unsubscribeLiveAudio(selectedCallId);
        stopAudio();
      }
      setSelectedCallId(callId);
      wsService.subscribeLiveAudio(callId);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedCall = useMemo(() => {
    return activeCalls.find((c) => c.callId === selectedCallId);
  }, [activeCalls, selectedCallId]);

  const selectedTranscripts = useMemo(() => {
    return selectedCallId ? transcripts[selectedCallId] || [] : [];
  }, [transcripts, selectedCallId]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 bg-card rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/10 text-red-600 rounded-lg">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Live Call Interception & Monitoring</h2>
            <p className="text-sm text-muted-foreground">
              Silent real-time audio eavesdropping & live translated transcript stream for system administrators
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={isWsConnected ? 'default' : 'secondary'} className="px-3 py-1 text-xs">
            {isWsConnected ? '● Live Stream Connected' : 'Connecting WebSocket...'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => wsService.requestActiveCalls()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Calls
          </Button>
        </div>
      </div>

      {/* Main Grid: Active Call List + Live Monitor Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Calls List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <Card className="shadow-sm border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-500" />
                  Active Calls ({activeCalls.length})
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {activeCalls.length} Ongoing
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Select an active call to initiate silent live audio interception
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 max-h-[550px] overflow-y-auto">
              {activeCalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                  <AlertCircle className="w-8 h-8 opacity-40" />
                  <p className="text-sm font-medium">No active calls right now</p>
                  <p className="text-xs opacity-75">
                    When a farmer calls an agent, it will appear here automatically.
                  </p>
                </div>
              ) : (
                activeCalls.map((call) => {
                  const isSelected = call.callId === selectedCallId;
                  const elapsed = elapsedTimes[call.callId] || 0;

                  return (
                    <div
                      key={call.callId}
                      className={`flex flex-col gap-3 p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/5 shadow-sm'
                          : 'hover:border-zinc-300 dark:hover:border-zinc-700 bg-card'
                      }`}
                      onClick={() => handleSelectCall(call.callId)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          {call.farmerNumber || 'Farmer Call'}
                        </span>
                        <Badge variant={isSelected ? 'default' : 'secondary'} className="text-xs">
                          {isSelected ? 'Listening Live' : 'Active'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-blue-500" />
                          <span>Agent: {call.agentName || call.agentUserId || 'Call Agent'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end font-mono">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span>{formatDuration(elapsed)}</span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isSelected ? 'destructive' : 'default'}
                        className="w-full mt-1 flex items-center justify-center gap-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectCall(call.callId);
                        }}
                      >
                        <Radio className={`w-3.5 h-3.5 ${isSelected ? 'animate-ping' : ''}`} />
                        {isSelected ? 'Stop Listening' : 'Listen Live'}
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live Interception Panel & Transcript Stream (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {selectedCallId && selectedCall ? (
            <Card className="shadow-sm border flex flex-col h-full">
              <CardHeader className="pb-3 border-b bg-muted/30">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base">Monitoring Call #{selectedCall.callId.slice(-6)}</h3>
                      <Badge variant="destructive" className="animate-pulse text-[10px]">
                        LIVE AUDIO
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Farmer: {selectedCall.farmerNumber || 'Unknown'} | Agent: {selectedCall.agentName || selectedCall.agentUserId || 'Call Agent'}
                    </p>
                  </div>

                  {/* Audio Controls */}
                  <div className="flex items-center gap-3 bg-background p-2 rounded-lg border shadow-sm w-full sm:w-auto justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={toggleMute}
                      >
                        {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-emerald-500" />}
                      </Button>

                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-24 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>

                    {/* Audio Waveform Indicator */}
                    <div className="flex items-center gap-1 h-4 px-2">
                      <div className={`w-1 bg-emerald-500 rounded-full transition-all ${isPlaying ? 'h-4 animate-bounce' : 'h-1'}`} />
                      <div className={`w-1 bg-emerald-500 rounded-full transition-all delay-75 ${isPlaying ? 'h-3 animate-bounce' : 'h-1'}`} />
                      <div className={`w-1 bg-emerald-500 rounded-full transition-all delay-150 ${isPlaying ? 'h-4 animate-bounce' : 'h-1'}`} />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 flex-1 flex flex-col min-h-[420px] max-h-[500px]">
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Live Translation Stream
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Duration: {formatDuration(elapsedTimes[selectedCall.callId] || 0)}
                  </span>
                </div>

                {/* Transcripts Bubbles Area */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                  {selectedTranscripts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2 py-12">
                      <Radio className="w-8 h-8 opacity-30 animate-pulse text-emerald-500" />
                      <p className="text-xs">Listening to audio stream...</p>
                      <p className="text-[11px] opacity-75">
                        Transcripts will appear here in real-time as the farmer and agent speak.
                      </p>
                    </div>
                  ) : (
                    selectedTranscripts.map((item) => {
                      const isFarmer = item.track === 'inbound';
                      return (
                        <div
                          key={item.id}
                          className={`flex flex-col ${isFarmer ? 'items-start' : 'items-end'}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {isFarmer ? 'Farmer' : 'Call Agent'}
                            </span>
                            {item.detectedLanguage && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 uppercase">
                                {item.detectedLanguage}
                              </Badge>
                            )}
                          </div>

                          <div
                            className={`p-3 rounded-xl max-w-[85%] text-xs shadow-sm ${
                              isFarmer
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none border'
                                : 'bg-emerald-600 text-white rounded-tr-none'
                            }`}
                          >
                            <p className="font-medium">{item.translatedText || item.originalText}</p>

                            {item.originalText && item.translatedText && item.originalText !== item.translatedText && (
                              <p className={`mt-1 text-[11px] italic pt-1 border-t ${
                                isFarmer ? 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400' : 'border-emerald-500 text-emerald-100'
                              }`}>
                                Original: "{item.originalText}"
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={transcriptsEndRef} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm border flex flex-col items-center justify-center p-12 text-center h-full min-h-[420px] bg-muted/10">
              <div className="p-4 bg-emerald-500/10 text-emerald-600 rounded-full mb-4">
                <Radio className="w-8 h-8 opacity-80" />
              </div>
              <h3 className="text-base font-bold">No Call Selected for Monitoring</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                Click "Listen Live" on any ongoing active call on the left panel to begin silent audio listening & real-time translation monitoring.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveCallMonitor;
