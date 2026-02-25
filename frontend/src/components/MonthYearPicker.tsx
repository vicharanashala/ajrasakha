const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const currentYear = new Date().getFullYear();
const START_YEAR = 2025;
const YEARS = Array.from(
  { length: currentYear - START_YEAR + 5 },
  (_, i) => START_YEAR + i,
);
const MonthYearPicker = ({
  label,
  value,
  onChange,
  maxMonthYear,
  minMonthYear,
}: {
  label: string;
  value: { month: number; year: number } | undefined;
  onChange: (val: { month: number; year: number }) => void;
  maxMonthYear?: { month: number; year: number };
  minMonthYear?: { month: number; year: number };
}) => {
  const selectedMonth = value?.month ?? 10;
  const selectedYear = value?.year ?? START_YEAR;

  const isMonthDisabled = (month: number, year: number) => {
    if (maxMonthYear) {
      if (year > maxMonthYear.year) return true;
      if (year === maxMonthYear.year && month > maxMonthYear.month) return true;
    }
    if (minMonthYear) {
      if (year < minMonthYear.year) return true;
      if (year === minMonthYear.year && month < minMonthYear.month) return true;
    }
    return false;
  };
  return (
    <div className="flex flex-col gap-2 flex-1 min-w-[160px]">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {/* Year selector */}
      <select
        className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        value={selectedYear}
        onChange={(e) => {
          const year = Number(e.target.value);
          let month = selectedMonth;
          // adjust month if it is invalid for the new year
    if (isMonthDisabled(month, year)) {
      // find first valid month in that year
      const firstValidMonth = MONTHS.findIndex(
        (_, idx) => !isMonthDisabled(idx, year)
      );

      if (firstValidMonth !== -1) {
        month = firstValidMonth;
      }
    }
          onChange({ month, year });
        }}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {/* Month grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((name, idx) => {
          const disabled = isMonthDisabled(idx, selectedYear);
          const isSelected =
            value?.month === idx && value?.year === selectedYear;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ month: idx, year: selectedYear })}
              className={`
                px-1 py-1.5 rounded-md text-xs font-medium transition-colors
                ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow"
                    : "hover:bg-muted text-foreground"
                }
                ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthYearPicker;
