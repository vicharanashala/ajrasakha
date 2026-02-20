type Props = {
  label: string;
};

export function TopRightBadge({ label }: Props) {
  return (
    <div
      className="
        absolute -top-2 -right-2
        inline-flex items-center justify-center
        px-1.5 py-[2px]
        text-[9px] font-semibold uppercase tracking-wide
        text-white
        rounded-full
        leading-none
        z-10
        bg-red-600 dark:bg-red-500
        animate-badgePulse
      "
    >
      {label}
    </div>
  );
}

export function TopLeftBadge({ label }: Props) {
  return (
    <div
      className="
        absolute -top-2 -left-2
        inline-flex items-center justify-center
        px-1.5 py-[2px]
        text-[9px] font-semibold uppercase tracking-wide
        text-white
        rounded-full
        leading-none
        z-10
        bg-red-600 dark:bg-red-500
        animate-badgePulse
      "
    >
      {label}
    </div>
  );
}  