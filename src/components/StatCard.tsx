import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  value: string | number;
  label: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

export default function StatCard({ value, label, trend = 'neutral', color = '#00FFC8' }: StatCardProps) {
  const trendIcon = {
    up: <TrendingUp className="w-3.5 h-3.5" />,
    down: <TrendingDown className="w-3.5 h-3.5" />,
    neutral: <Minus className="w-3.5 h-3.5" />,
  };

  const trendColor = {
    up: 'text-[#3FB950]',
    down: 'text-[#FF4757]',
    neutral: 'text-[#8B949E]',
  };

  return (
    <div className="glass-card p-4 flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-2xl font-bold font-display" style={{ color }}>
          {value}
        </span>
        <span className={trendColor[trend]}>{trendIcon[trend]}</span>
      </div>
      <span className="text-xs text-[#8B949E]">{label}</span>
    </div>
  );
}
