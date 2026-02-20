import React from 'react';
import { 
  LayoutDashboard, 
  PackagePlus, 
  PackageCheck, 
  Boxes, 
  History, 
  LogOut 
} from 'lucide-react';
import { PageView } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate }) => {
  
  const navItems = [
    { id: 'DASHBOARD' as PageView, label: '대시보드', icon: LayoutDashboard },
    { id: 'INBOUND' as PageView, label: '입고 관리', icon: PackagePlus },
    { id: 'OUTBOUND' as PageView, label: '출고 검수', icon: PackageCheck },
    { id: 'INVENTORY' as PageView, label: '재고 조회', icon: Boxes },
    { id: 'LOGS' as PageView, label: '입출고 로그', icon: History },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-10">
        <div className="p-6 border-b border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-600 rounded-md flex items-center justify-center shadow-lg shadow-amber-900/50">
            <Boxes size={20} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">NEXUS<span className="text-amber-500">ERP</span></span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200
                  ${isActive 
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-900/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white cursor-pointer transition-colors">
            <LogOut size={16} />
            <span className="text-sm font-medium">로그아웃</span>
          </div>
          <div className="mt-4 px-4">
            <div className="text-xs text-slate-500">Warehouse ID: WH-KR-01</div>
            <div className="text-xs text-slate-500">v1.0.4 (Stable)</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header (Optional sticky header for title/user info) */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm shrink-0">
          <h1 className="text-lg font-semibold text-slate-800">
            {navItems.find(n => n.id === currentPage)?.label}
          </h1>
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
              AD
            </div>
            <div className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">Admin User</span>
            </div>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;