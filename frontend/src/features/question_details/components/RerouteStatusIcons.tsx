type LetterIconProps = {
  letter: string;
  className?: string;
};

const LetterIcon = ({ letter, className }: LetterIconProps) => (
  <div
    className={`text-red flex items-center justify-center text-xs font-semibold ${className}`}
  >
    {letter}
  </div>
);

export const ExpertIcon = (props: { className?: string }) => (
  <LetterIcon letter="E" {...props} />
);

export const ModeratorIcon = (props: { className?: string }) => (
  <LetterIcon letter="M" {...props} />
);
