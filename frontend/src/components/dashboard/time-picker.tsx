"use client";
import {useState, useEffect} from "react";
import { Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";

interface TimePickerProps {
  value?: string;
  onChange: (time: string) => void;
  label: string;
}

export const TimePicker = ({ value, onChange, label }: TimePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [selectedMinute, setSelectedMinute] = useState<number>(0);

  useEffect(() => {
    if (value) {
      const [hour, minute] = value.split(":").map(Number);
      setSelectedHour(hour);
      setSelectedMinute(minute);
    }
  }, [value]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const handleHourSelect = (hour: number) => {
    setSelectedHour(hour);
    const timeString = `${String(hour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`;
    onChange(timeString);
  };

  const handleMinuteSelect = (minute: number) => {
    setSelectedMinute(minute);
    const timeString = `${String(selectedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    onChange(timeString);
  };

  const displayTime = value || "--:--";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative group">
          <label className="absolute -top-2 left-3 text-[10px] font-semibold text-primary bg-card px-1.5 z-10 group-hover:text-primary/80 transition-colors">
            {label}
          </label>
          <div className="h-10 px-4 pr-3 rounded-lg border-2 border-primary/30 bg-card hover:bg-accent/5 hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer min-w-[140px] shadow-sm flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">
              {displayTime}
            </span>
            <Clock className="w-4 h-4 text-primary/60" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-4">
          <div className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Select {label}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Hours Column */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 text-center">
                Hours
              </div>
              <div className="max-h-[240px] overflow-y-auto border rounded-lg p-1 bg-accent/5 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                {hours.map((hour) => (
                  <button
                    key={hour}
                    onClick={() => handleHourSelect(hour)}
                    className={`w-full px-3 py-2 text-sm rounded-md transition-all ${
                      selectedHour === hour
                        ? "bg-primary text-white font-semibold shadow-sm"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    {String(hour).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes Column */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 text-center">
                Minutes
              </div>
              <div className="max-h-[240px] overflow-y-auto border rounded-lg p-1 bg-accent/5 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                {minutes.map((minute) => (
                  <button
                    key={minute}
                    onClick={() => handleMinuteSelect(minute)}
                    className={`w-full px-3 py-2 text-sm rounded-md transition-all ${
                      selectedMinute === minute
                        ? "bg-primary text-white font-semibold shadow-sm"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    {String(minute).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              Selected: <span className="font-semibold text-foreground">{displayTime}</span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};