import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Command } from '@/stores/commandStore';

interface CommandEditDrawerProps {
  isOpen: boolean;
  command: Command | null;
  onSave: (data: Omit<Command, 'id' | 'enabled'>) => void;
  onClose: () => void;
}

export default function CommandEditDrawer({ isOpen, command, onSave, onClose }: CommandEditDrawerProps) {
  const [label, setLabel] = useState('');
  const [keywords, setKeywords] = useState('');
  const [actionType, setActionType] = useState<'system' | 'app' | 'custom'>('system');
  const [action, setAction] = useState('');
  const [icon, setIcon] = useState('Zap');

  useEffect(() => {
    if (command) {
      setLabel(command.label);
      setKeywords(command.keywords.join('，'));
      setActionType(command.actionType);
      setAction(command.action);
      setIcon(command.icon);
    } else {
      setLabel('');
      setKeywords('');
      setActionType('system');
      setAction('');
      setIcon('Zap');
    }
  }, [command, isOpen]);

  const handleSave = () => {
    onSave({
      label,
      keywords: keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean),
      actionType,
      action,
      icon,
    });
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />

          <div className="relative w-[380px] h-full bg-[#161B22] border-l border-[#30363D] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363D]">
              <h2 className="text-base font-medium text-[#E6EDF3]">
                {command ? '编辑指令' : '新建指令'}
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div>
                <label className="block text-xs text-[#8B949E] mb-1.5">指令名称</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-sm text-[#E6EDF3] outline-none focus:border-[#00FFC8] transition-colors"
                  placeholder="输入指令名称"
                />
              </div>

              <div>
                <label className="block text-xs text-[#8B949E] mb-1.5">关键词</label>
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-sm text-[#E6EDF3] outline-none focus:border-[#00FFC8] transition-colors"
                  placeholder="用逗号分隔多个关键词"
                />
              </div>

              <div>
                <label className="block text-xs text-[#8B949E] mb-1.5">操作类型</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as 'system' | 'app' | 'custom')}
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-sm text-[#E6EDF3] outline-none focus:border-[#00FFC8] transition-colors appearance-none"
                >
                  <option value="system">系统 (system)</option>
                  <option value="app">应用 (app)</option>
                  <option value="custom">自定义 (custom)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#8B949E] mb-1.5">执行动作</label>
                <input
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-sm text-[#E6EDF3] outline-none focus:border-[#00FFC8] transition-colors"
                  placeholder="输入执行动作标识"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 px-5 py-4 border-t border-[#30363D]">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-md text-sm text-[#8B949E] bg-[#21262D] hover:bg-[#30363D] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 rounded-md text-sm text-[#0D1117] bg-[#00FFC8] hover:bg-[#00CC9F] font-medium transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
