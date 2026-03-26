/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { QuestionGallery } from './components/QuestionGallery';
import { StudentSelector } from './components/StudentSelector';

interface Student {
  id: string;
  name: string;
  grade?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);

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

  if (!currentStudent) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans selection:bg-stone-900 selection:text-white">
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
      <footer className="max-w-4xl mx-auto px-4 py-12 border-t border-stone-200 text-center">
        <p className="text-xs text-stone-400 uppercase tracking-[0.2em]">
          Powered by Gemini 2.5 Flash Image • 隱私安全 • 本地處理
        </p>
      </footer>
    </div>
  );
}

