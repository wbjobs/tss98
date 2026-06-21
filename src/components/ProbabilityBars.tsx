interface ProbabilityBarsProps {
  distribution: { label: string; probability: number }[];
}

export default function ProbabilityBars({ distribution }: ProbabilityBarsProps) {
  const sorted = [...distribution]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2 w-full">
      {sorted.map((item, index) => {
        const isTop = index === 0;
        const barColor = isTop ? "#00FFC8" : "#8B949E";
        const percent = Math.round(item.probability * 100);

        return (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className={`text-xs w-20 truncate text-right ${
                isTop ? "text-[#00FFC8] font-bold" : "text-[#8B949E]"
              }`}
            >
              {item.label}
            </span>
            <div className="flex-1 h-4 bg-[#161B22] rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300 ease-out"
                style={{
                  width: `${percent}%`,
                  backgroundColor: barColor,
                  opacity: isTop ? 0.9 : 0.4,
                }}
              />
            </div>
            <span
              className={`text-xs w-10 text-right font-mono ${
                isTop ? "text-[#00FFC8]" : "text-[#8B949E]"
              }`}
            >
              {percent}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
