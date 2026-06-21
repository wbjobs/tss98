import { Pencil, Trash2, Settings, Camera, SkipForward, SkipBack, Play, Volume2, Volume1, Globe, Mic, Terminal, Zap } from 'lucide-react';
import type { Command } from '@/stores/commandStore';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings, Camera, SkipForward, SkipBack, Play, Volume2, Volume1, Globe, Mic, Terminal, Zap,
};

const typeColors: Record<string, string> = {
  system: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  app: 'bg-green-500/20 text-green-400 border border-green-500/30',
  custom: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
};

const typeLabels: Record<string, string> = {
  system: '系统',
  app: '应用',
  custom: '自定义',
};

interface CommandCardProps {
  command: Command;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}

export default function CommandCard({ command, onEdit, onDelete, onToggle }: CommandCardProps) {
  const IconComponent = iconMap[command.icon] || Zap;

  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#00FFC8]/10 flex items-center justify-center shrink-0">
        <IconComponent className="w-5 h-5 text-[#00FFC8]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-[#E6EDF3] truncate">
            {command.label}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColors[command.actionType]}`}>
            {typeLabels[command.actionType]}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {command.keywords.map((kw) => (
            <span
              key={kw}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262D] text-[#8B949E]"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onToggle(command.id)}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            command.enabled ? 'bg-[#00FFC8]' : 'bg-[#30363D]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              command.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>

        <button
          onClick={() => onEdit(command.id)}
          className="p-1.5 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#00FFC8] transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(command.id)}
          className="p-1.5 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#FF4757] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
