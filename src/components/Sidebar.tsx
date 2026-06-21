import { NavLink } from "react-router-dom";
import { Mic, Home, Command, FileText, Settings } from "lucide-react";

const navItems = [
  { to: "/", icon: Home, label: "主控制台" },
  { to: "/commands", icon: Command, label: "指令管理" },
  { to: "/logs", icon: FileText, label: "系统日志" },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-[#0D1117] border-r border-[#30363D] flex flex-col items-center py-4 z-50">
      <div className="mb-8">
        <Mic size={28} color="#00FFC8" />
      </div>

      <nav className="flex-1 flex flex-col items-center gap-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `w-full flex flex-col items-center justify-center py-3 relative transition-colors ${
                isActive
                  ? "text-[#00FFC8] border-l-2 border-[#00FFC8]"
                  : "text-[#8B949E] border-l-2 border-transparent hover:text-[#E6EDF3]"
              }`
            }
          >
            <Icon size={20} />
            <span className="text-[10px] mt-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <button className="flex flex-col items-center justify-center text-[#8B949E] hover:text-[#E6EDF3] transition-colors py-2">
          <Settings size={20} />
        </button>
      </div>
    </aside>
  );
}
