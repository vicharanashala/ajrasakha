interface WhatsappHistoryLinkProps {
  mobileNumber: string;
  className?: string;
  label?: string;
}

export default function WhatsappHistoryLink({
  mobileNumber,
  className = "",
  label,
}: WhatsappHistoryLinkProps) {
  const currentOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const formattedNumber = (() => {
    if (
      !label &&
      mobileNumber?.length === 12 &&
      mobileNumber.startsWith("91")
    ) {
      return `+91 ${mobileNumber.slice(2)}`;
    }

    return label || mobileNumber;
  })();

  return (
    <a
      href={`${currentOrigin}/whatsapp-history?threadId="${mobileNumber}"`}
      rel="noopener noreferrer"
      className={`
        font-medium
        text-[#3AAA5A]
        hover:underline
        ${className}
      `}
    >
      {formattedNumber}
    </a>
  );
}
