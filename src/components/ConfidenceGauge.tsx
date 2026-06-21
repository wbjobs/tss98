interface ConfidenceGaugeProps {
  confidence: number;
  threshold: number;
}

export default function ConfidenceGauge({ confidence, threshold }: ConfidenceGaugeProps) {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const dashOffset = circumference * (1 - clampedConfidence);
  const isAboveThreshold = clampedConfidence >= threshold;
  const strokeColor = isAboveThreshold ? "#00FFC8" : "#FF4757";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#21262D"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-xl font-mono font-bold"
            style={{ color: strokeColor }}
          >
            {Math.round(clampedConfidence * 100)}%
          </span>
        </div>
      </div>
      <span className="text-xs text-[#8B949E]">置信度</span>
    </div>
  );
}
