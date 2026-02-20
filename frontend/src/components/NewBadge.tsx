type Props = {
  label: string;
};

export function TopRightBadge({ label }: Props) {
  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const baseColor = isDark ? "#f51717ff" : "#dc2626";

  const glowSoft = isDark
    ? "rgba(248, 113, 113, 0.22)"
    : "rgba(220, 38, 38, 0.22)";
  const glowStrong = isDark
    ? "rgba(248, 113, 113, 0.35)"
    : "rgba(220, 38, 38, 0.35)";

  return (
    <div
      style={{
        position: "absolute",
        top: "-12px",
        right: "-6px",
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 4px",
        fontSize: "8px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "#ffffff",
        backgroundColor: baseColor,
        borderRadius: "9999px",

        // 👉 reduced glow intensity
        boxShadow: `0 0 3px 1px ${glowSoft}`,

        animation: "badgePulse 2.4s ease-in-out infinite",
      }}
    >
      <style>
        {`
          @keyframes badgePulse {
            0%, 100% {
              box-shadow: 0 0 3px 1px ${glowSoft};
            }
            50% {
              box-shadow: 0 0 6px 2px ${glowStrong};
            }
          }
        `}
      </style>

      {label}
    </div>
  );
}

export function TopLeftBadge({ label }: Props){
  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const baseColor = isDark ? "#f51717ff" : "#dc2626";

  const glowSoft = isDark
    ? "rgba(248, 113, 113, 0.22)"
    : "rgba(220, 38, 38, 0.22)";
  const glowStrong = isDark
    ? "rgba(248, 113, 113, 0.35)"
    : "rgba(220, 38, 38, 0.35)";

  return (
    <div
      style={{
        position: "absolute",
        top: "-14px",
        left: "-8px",
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 5px",
        fontSize: "8px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "#ffffff",
        backgroundColor: baseColor,
        borderRadius: "9999px",

        boxShadow: `0 0 3px 1px ${glowSoft}`,

        animation: "badgePulse 2.4s ease-in-out infinite",
      }}
    >
      <style>
        {`
          @keyframes badgePulse {
            0%, 100% {
              box-shadow: 0 0 3px 1px ${glowSoft};
            }
            50% {
              box-shadow: 0 0 6px 2px ${glowStrong};
            }
          }
        `}
      </style>

      {label}
    </div>
  );
}  