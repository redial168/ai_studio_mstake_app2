import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, Users, ChevronRight, Trash2, GraduationCap } from 'lucide-react';
import { getAllStudents, saveStudent, deleteStudent } from '../lib/db';

interface Student {
  id: string;
  name: string;
  grade?: string;
}

interface StudentSelectorProps {
  onSelect: (student: Student) => void;
}

export function StudentSelector({ onSelect }: StudentSelectorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      const data = await getAllStudents();
      setStudents(data);
    } catch (error) {
      console.error('Failed to load students:', error);
      // If version error occurs, we might want to suggest clearing data or refreshing
      if (error instanceof Error && error.name === 'VersionError') {
        alert('資料庫版本不符。系統已嘗試修復，請重新整理頁面。');
      } else {
        alert('載入學生資料失敗。');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await saveStudent({ name: newName, grade: newGrade });
    setNewName('');
    setNewGrade('');
    setIsAdding(false);
    loadStudents();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('確定要刪除此學生及其所有錯題嗎？此操作無法復原。')) {
      await deleteStudent(id);
      loadStudents();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-stone-900 text-white mb-6"
        >
          <GraduationCap size={32} />
        </motion.div>
        <h1 className="text-3xl font-serif italic mb-2">錯題練習系統</h1>
        <p className="text-stone-500">請選擇學生以開始管理錯題</p>
      </div>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {students.map((student) => (
            <motion.div
              key={student.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => onSelect(student)}
              className="group relative bg-white border border-stone-200 p-6 rounded-2xl cursor-pointer hover:border-stone-900 transition-all hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 group-hover:bg-stone-900 group-hover:text-white transition-colors">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">{student.name}</h3>
                    {student.grade && (
                      <p className="text-sm text-stone-400">{student.grade}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDelete(e, student.id)}
                    className="p-2 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                  <ChevronRight className="text-stone-300 group-hover:text-stone-900 transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {!isAdding ? (
          <motion.button
            layout
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-all"
          >
            <UserPlus size={20} />
            <span>新增學生</span>
          </motion.button>
        ) : (
          <motion.form
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onSubmit={handleAdd}
            className="bg-white border border-stone-900 p-6 rounded-2xl shadow-xl"
          >
            <h3 className="font-serif italic text-lg mb-4">新增學生資料</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">姓名</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：王小明"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-900 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">年級 / 備註</label>
                <input
                  type="text"
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value)}
                  placeholder="例如：三年二班"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-900 transition-colors"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 px-4 py-3 text-stone-500 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                >
                  確認新增
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </div>
    </div>
  );
}
