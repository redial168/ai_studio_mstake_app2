import React from 'react';
import { BookOpen, Camera, History, UserCircle, LogOut } from 'lucide-react';

interface HeaderProps {
  activeTab: 'upload' | 'history';
  onTabChange: (tab: 'upload' | 'history') => void;
  studentName: string;
  onSwitchStudent: () => void;
}

export function Header({ activeTab, onTabChange, studentName, onSwitchStudent }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-serif text-xl font-bold tracking-tight hidden sm:block">錯題練習系統</h1>
          </div>
          
          <div className="h-6 w-px bg-stone-200 hidden sm:block" />
          
          <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-full border border-stone-100">
            <UserCircle className="w-4 h-4 text-stone-400" />
            <span className="text-sm font-medium text-stone-700">{studentName}</span>
            <button 
              onClick={onSwitchStudent}
              className="p-1 hover:bg-stone-200 rounded-full text-stone-400 hover:text-stone-600 transition-all"
              title="切換學生"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        </div>
        
        <nav className="flex gap-1 bg-stone-100 p-1 rounded-full">
          <button
            onClick={() => onTabChange('upload')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'upload' 
                ? 'bg-white text-stone-900 shadow-sm' 
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>上傳題目</span>
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'history' 
                ? 'bg-white text-stone-900 shadow-sm' 
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>錯題本</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
