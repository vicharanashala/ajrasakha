import React, { useEffect, useRef, useState } from "react";
import { List, LayoutGrid, ChevronDown } from "lucide-react";

type ViewType = "grid" | "table";

interface ViewDropdownProps {
  view: ViewType;
  setView: (v: "grid" | "table") => void;
}

const ViewDropdown: React.FC<ViewDropdownProps> = ({ view, setView }) => {
  const [open, setOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (value: ViewType) => {
    setView(value);
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative hidden md:inline-block">
      {/* Trigger Button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium 
                   rounded-md border border-gray-200
                   bg-white 
                   hover:bg-gray-50 
                   transition-colors
                   dark:bg-[#1a1a1a] dark:border-gray-800 dark:hover:border-gray-600 dark:shadow-none 
                   "
      >
        {view === "grid" ? <LayoutGrid size={14} /> : <List size={14} />}
        <span>{view === "grid" ? "Grid View" : "List View"}</span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-40 rounded-md shadow-lg 
                     bg-white 
                     border border-gray-200 
                     overflow-hidden z-50
                     dark:bg-[#1a1a1a] dark:border-gray-800 dark:shadow-none 
                     "
        >
          <button
            onClick={() => handleSelect("table")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm 
              hover:bg-gray-100  transition-colors dark:bg-[#1a1a1a] dark:border-gray-800 dark:hover:bg-gray-600 dark:shadow-none 
              ${
                view === "table"
                  ? "bg-gray-100 dark:bg-gray-800 font-medium"
                  : ""
              }`}
          >
            <List size={14} />
            List View
          </button>

          <button
            onClick={() => handleSelect("grid")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm 
              hover:bg-gray-100 transition-colors
              dark:bg-[#1a1a1a] dark:border-gray-800 dark:hover:bg-gray-700 dark:shadow-none
              ${
                view === "grid"
                  ? "bg-gray-100 dark:bg-gray-800 font-medium"
                  : ""
              }`}
          >
            <LayoutGrid size={14} />
            Grid View
          </button>
        </div>
      )}
    </div>
  );
};

export default ViewDropdown;
