import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCommandStore } from '@/stores/commandStore';
import CommandCard from '@/components/CommandCard';
import CommandEditDrawer from '@/components/CommandEditDrawer';
import type { Command } from '@/stores/commandStore';

export default function Commands() {
  const { commands, confidenceThreshold, addCommand, updateCommand, deleteCommand, toggleCommand, setConfidenceThreshold } = useCommandStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);

  const handleAdd = () => {
    setEditingCommand(null);
    setDrawerOpen(true);
  };

  const handleEdit = (id: string) => {
    const cmd = commands.find((c) => c.id === id);
    if (cmd) {
      setEditingCommand(cmd);
      setDrawerOpen(true);
    }
  };

  const handleDelete = (id: string) => {
    deleteCommand(id);
  };

  const handleToggle = (id: string) => {
    toggleCommand(id);
  };

  const handleSave = (data: Omit<Command, 'id' | 'enabled'>) => {
    if (editingCommand) {
      updateCommand(editingCommand.id, data);
    } else {
      addCommand({
        id: crypto.randomUUID(),
        ...data,
        enabled: true,
      });
    }
    setDrawerOpen(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#E6EDF3]">指令管理</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-[#0D1117] bg-[#00FFC8] hover:bg-[#00CC9F] transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加指令
        </button>
      </div>

      <div className="glass-card p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#8B949E]">置信度阈值</span>
          <span className="text-sm font-mono text-[#00FFC8]">{confidenceThreshold.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0.3}
          max={0.95}
          step={0.05}
          value={confidenceThreshold}
          onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[#30363D] accent-[#00FFC8]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#8B949E]">0.30</span>
          <span className="text-[10px] text-[#8B949E]">0.95</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {commands.map((cmd) => (
            <CommandCard
              key={cmd.id}
              command={cmd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      <CommandEditDrawer
        isOpen={drawerOpen}
        command={editingCommand}
        onSave={handleSave}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
