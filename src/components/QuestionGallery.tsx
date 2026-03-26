import React, { useEffect, useState } from 'react';
import { getAllQuestions, deleteQuestion } from '../lib/db';
import { Trash2, Calendar, FileText, ExternalLink, Download, BookOpen, GraduationCap, Clock, Eye, X, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function QuestionGallery({ studentId }: { studentId: string }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState<string | null>(null);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const data = await getAllQuestions(studentId);
      setQuestions(data.reverse());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [studentId]);

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除這道題目嗎？')) {
      await deleteQuestion(id);
      loadQuestions();
    }
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-stone-300" />
        </div>
        <h3 className="text-lg font-medium text-stone-900">錯題本還是空的</h3>
        <p className="text-stone-500 mt-1">上傳第一張照片開始整理吧！</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {questions.map((q) => (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="group bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-all"
            >
              <div className="aspect-[3/4] bg-white relative overflow-hidden border-b border-stone-100">
                <img 
                  src={q.processedUrl} 
                  alt="Question" 
                  className="w-full h-full object-contain p-2"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/5 transition-colors pointer-events-none" />
                
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setIsZoomed(q.processedUrl)}
                    className="p-2 bg-white shadow-lg rounded-full text-stone-600 hover:text-stone-900 transition-colors"
                    title="放大查看"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => downloadImage(q.processedUrl, `question-${q.id}.png`)}
                    className="p-2 bg-white shadow-lg rounded-full text-stone-600 hover:text-stone-900 transition-colors"
                    title="下載圖片"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="p-2 bg-white shadow-lg rounded-full text-red-500 hover:bg-red-50 transition-colors"
                    title="刪除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {q.subject && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-900 bg-stone-100 px-2 py-0.5 rounded-full">
                        <BookOpen className="w-3 h-3" />
                        {q.subject}
                      </div>
                    )}
                    {q.grade && (
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-500">
                        <GraduationCap className="w-3 h-3" />
                        {q.grade} 年級
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setIsZoomed(q.originalUrl)}
                    className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:text-amber-700 transition-colors bg-amber-50 px-2 py-1 rounded-lg"
                    title="查看原始照片 (含筆跡/答案)"
                  >
                    <Eye className="w-3 h-3" />
                    查看答案
                  </button>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-stone-50 pt-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                    <Calendar className="w-3 h-3" />
                    {q.date || new Date(q.createdAt).toLocaleDateString()}
                  </div>
                  {q.time && (
                    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                      <Clock className="w-3 h-3" />
                      {q.time}
                    </div>
                  )}
                </div>
                
                {(q.remarks || q.note) && (
                  <p className="text-sm text-stone-600 line-clamp-2 italic border-t border-stone-50 pt-2">
                    {q.remarks || q.note}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {isZoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-stone-900/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setIsZoomed(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsZoomed(null)}
                className="absolute -top-12 right-0 p-2 text-white hover:text-stone-300 transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              <img
                src={isZoomed}
                alt="Zoomed"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
