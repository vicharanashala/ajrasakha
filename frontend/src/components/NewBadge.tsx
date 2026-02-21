type Props = {
  label: string;
  top?: number;
  right?: number;
  left?: number;
};

export function TopRightBadge({ label, top = 2, right = 2 }: Props) {
  return (
    <div
      className={`
         absolute -top-${top} -right-${right}
        inline-flex items-center justify-center
        px-1.5 py-[2px]
        text-[9px] font-semibold uppercase tracking-wide
        text-white
        rounded-full
        leading-none
        z-10
        bg-red-600 dark:bg-red-500
        animate-badgePulse
        `}
    >
      {label}
    </div>
  );
}

export function TopLeftBadge({ label, top = 2, left = 2 }: Props) {
  return (
    <div
      className={`
        absolute -top-${top} -left-${left}
        inline-flex items-center justify-center
        px-1.5 py-[2px]
        text-[9px] font-semibold uppercase tracking-wide
        text-white
        rounded-full
        leading-none
        z-10
        bg-red-600 dark:bg-red-500
        animate-badgePulse
        `}
    >
      {label}
    </div>
  );
}
