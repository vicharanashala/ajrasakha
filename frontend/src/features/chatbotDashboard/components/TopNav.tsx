export function TopNav({ season }: { season: string }) {
  return (
    <div className="bg-[#0F4A24] flex items-center justify-between px-5 h-[52px] shrink-0">
      <div className="flex items-center gap-[14px]">
        <span className="bg-[#3AAA5A] text-white text-[13px] font-medium px-[10px] py-1 rounded-md">ACE</span>
        <span className="text-white/85 text-[13px] font-medium">ANNAM.AI · Agri Intelligence Platform</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-[5px] bg-[rgba(74,220,100,0.15)] text-[#4adc64] text-[11px] font-medium px-[9px] py-[3px] rounded-full">
          <span className="w-[5px] h-[5px] bg-[#4adc64] rounded-full" />Live
        </span>
        <span className="text-white/45 text-[11px]">{season} · Q3</span>
        <div className="w-7 h-7 rounded-full bg-[#1E7A3C] flex items-center justify-center text-white text-[11px] font-medium">PK</div>
      </div>
    </div>
  );
}
