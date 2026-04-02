/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { QuestionGallery } from './components/QuestionGallery';
import { StudentSelector } from './components/StudentSelector';
import { auth, signInWithGoogle, logOut } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { testConnection } from './lib/db';

interface Student {
  id: string;
  name: string;
  grade?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Load last selected student from localStorage if available
  useEffect(() => {
    const saved = localStorage.getItem('last_student');
    if (saved) {
      try {
        setCurrentStudent(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved student', e);
      }
    }
  }, []);

  const handleSelectStudent = (student: Student) => {
    setCurrentStudent(student);
    localStorage.setItem('last_student', JSON.stringify(student));
  };

  const handleSwitchStudent = () => {
    setCurrentStudent(null);
    localStorage.removeItem('last_student');
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-500">載入中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center font-sans">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-stone-200 text-center">
          <h1 className="text-2xl font-serif text-stone-900 mb-2">錯題本系統</h1>
          <p className="text-stone-500 mb-8">請先登入以同步您的錯題資料</p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-stone-900 text-white py-3 rounded-xl hover:bg-stone-800 transition-colors"
          >
            使用 Google 登入
          </button>
        </div>
      </div>
    );
  }

  if (!currentStudent) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans selection:bg-stone-900 selection:text-white">
        <div className="absolute top-4 right-4">
          <button onClick={logOut} className="text-sm text-stone-500 hover:text-stone-900">登出</button>
        </div>
        <StudentSelector onSelect={handleSelectStudent} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans selection:bg-stone-900 selection:text-white">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        studentName={currentStudent.name}
        onSwitchStudent={handleSwitchStudent}
      />
      
      <main className="pb-20">
        {activeTab === 'upload' ? (
          <ImageUploader 
            studentId={currentStudent.id}
            onSaveSuccess={() => setActiveTab('history')} 
          />
        ) : (
          <QuestionGallery studentId={currentStudent.id} />
        )}
      </main>

      {/* Footer Info */}
      <footer className="max-w-4xl mx-auto px-4 py-12 border-t border-stone-200 text-center flex flex-col items-center gap-4">
        <p className="text-xs text-stone-400 uppercase tracking-[0.2em]">
          Powered by Gemini 2.5 Flash Image • 雲端同步
        </p>
        <button onClick={logOut} className="text-xs text-stone-400 hover:text-stone-600 underline">
          登出 {user.email}
        </button>
      </footer>
    </div>
  );
}

