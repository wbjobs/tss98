import { useState, useMemo } from 'react';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogStore } from '@/stores/logStore';
import StatCard from '@/components/StatCard';

const PAGE_SIZE = 10;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(ts)}`;
}

export default function Logs() {
  const { logs, clearLogs, getStats } = useLogStore();
  const [currentPage, setCurrentPage] = useState(1);

  const stats = useMemo(() => getStats(), [logs]);

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLogs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return [...logs].reverse().slice(start, start + PAGE_SIZE);
  }, [logs, safePage]);

  const maxTopCount = stats.topCommands.length > 0 ? stats.topCommands[0].count : 1;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#E6EDF3]">系统日志</h1>
        <button
          onClick={clearLogs}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm text-[#8B949E] bg-[#21262D] hover:bg-[#FF4757]/20 hover:text-[#FF4757] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          清空日志
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          value={stats.totalRecognitions}
          label="总识别次数"
          color="#00FFC8"
        />
        <StatCard
          value={`${stats.avgInferenceTime.toFixed(0)}ms`}
          label="平均推理延迟"
          color="#00FFC8"
        />
        <StatCard
          value={`${(stats.successRate * 100).toFixed(1)}%`}
          label="识别成功率"
          trend={stats.successRate >= 0.8 ? 'up' : stats.successRate >= 0.5 ? 'neutral' : 'down'}
          color="#00FFC8"
        />
        <StatCard
          value={`${(stats.unrecognizedRate * 100).toFixed(1)}%`}
          label="未识别率"
          trend={stats.unrecognizedRate <= 0.1 ? 'up' : stats.unrecognizedRate <= 0.3 ? 'neutral' : 'down'}
          color="#FF4757"
        />
      </div>

      {stats.topCommands.length > 0 && (
        <div className="glass-card p-4 mb-6">
          <h3 className="text-sm text-[#8B949E] mb-3">高频指令 Top 5</h3>
          <div className="space-y-2">
            {stats.topCommands.map((item) => (
              <div key={item.command} className="flex items-center gap-3">
                <span className="text-xs text-[#E6EDF3] w-20 truncate shrink-0">{item.command}</span>
                <div className="flex-1 h-5 bg-[#21262D] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#00FFC8]/60 transition-all"
                    style={{ width: `${(item.count / maxTopCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[#8B949E] w-8 text-right shrink-0">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#8B949E] text-xs border-b border-[#30363D]">
                <th className="text-left py-2 px-3 font-medium">时间</th>
                <th className="text-left py-2 px-3 font-medium">结果</th>
                <th className="text-left py-2 px-3 font-medium">置信度</th>
                <th className="text-left py-2 px-3 font-medium">执行动作</th>
                <th className="text-left py-2 px-3 font-medium">推理延迟</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map((log, i) => {
                const isUnrecognized = !log.result || log.action === null;
                return (
                  <tr
                    key={log.id}
                    className={`border-b border-[#21262D] ${i % 2 === 1 ? 'bg-[#161B22]/50' : ''}`}
                  >
                    <td className="py-2 px-3 text-[#8B949E] font-mono text-xs">{formatDate(log.timestamp)}</td>
                    <td className={`py-2 px-3 ${isUnrecognized ? 'text-[#FF4757]' : 'text-[#E6EDF3]'}`}>
                      {log.result || '未识别'}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-[#8B949E]">{(log.confidence * 100).toFixed(1)}%</td>
                    <td className={`py-2 px-3 text-xs ${log.action ? 'text-[#00FFC8]' : 'text-[#8B949E]'}`}>
                      {log.action || '—'}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-[#8B949E]">{log.inferenceTime}ms</td>
                  </tr>
                );
              })}
              {paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#8B949E]">暂无日志记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-3 border-t border-[#30363D]">
            <span className="text-xs text-[#8B949E]">
              第 {safePage} / {totalPages} 页，共 {logs.length} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 rounded-md text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-md text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
