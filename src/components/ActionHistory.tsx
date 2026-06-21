import { CheckCircle, XCircle } from 'lucide-react';
import { useVoiceStore } from '@/stores/voiceStore';

export default function ActionHistory() {
  const actions = useVoiceStore((s) => s.actions);

  return (
    <div className="max-h-[300px] overflow-y-auto pr-2">
      {actions.length === 0 && (
        <p className="text-center py-6 text-[#8B949E] text-sm">暂无操作记录</p>
      )}
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#30363D]" />
        {actions.map((item) => (
          <div key={item.id} className="relative pb-4 last:pb-0">
            <div
              className={`absolute left-[-17px] top-1.5 w-3 h-3 rounded-full border-2 ${
                item.success
                  ? 'border-[#3FB950] bg-[#0D1117]'
                  : 'border-[#FF4757] bg-[#0D1117]'
              }`}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#E6EDF3] truncate">
                    {item.command}
                  </span>
                  <span className="text-xs text-[#8B949E] shrink-0">
                    {item.action}
                  </span>
                </div>
                <span className="text-xs text-[#484F58]">
                  {new Date(item.timestamp).toLocaleTimeString('zh-CN')}
                </span>
              </div>
              {item.success ? (
                <CheckCircle className="w-4 h-4 text-[#3FB950] shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-[#FF4757] shrink-0 mt-0.5" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
