import React, { useEffect, useState } from 'react';
import { getAllQuestions, deleteQuestion } from '../lib/db';
import { Trash2, Calendar, FileText, ExternalLink, Download, BookOpen, GraduationCap, Clock, Eye, X, Maximize2, ListFilter, AlertTriangle, Printer, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import domtoimage from 'dom-to-image-more';

export function QuestionGallery({ studentId }: { studentId: string }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'subject'>('date-desc');
  
  // Filtering and Selection states
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Custom modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const data = await getAllQuestions(studentId);
      setQuestions(data);
    } catch (error) {
      console.error('Failed to load questions:', error);
      if (error instanceof Error && error.name === 'VersionError') {
        setAlertMessage('資料庫版本不符，請重新整理頁面。');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [studentId]);

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: '刪除題目',
      message: '確定要刪除這道題目嗎？',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await deleteQuestion(id);
        loadQuestions();
      }
    });
  };

  const handleDeleteAll = () => {
    setConfirmModal({
      isOpen: true,
      title: '全部刪除',
      message: '確定要刪除該學生的「所有」錯題嗎？此操作無法復原。',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        for (const q of questions) {
          await deleteQuestion(q.id);
        }
        await loadQuestions();
      }
    });
  };

  const uniqueGrades = Array.from(new Set(questions.map(q => q.grade).filter(Boolean)));
  const uniqueSubjects = Array.from(new Set(questions.map(q => q.subject).filter(Boolean)));
  const uniqueDates = Array.from(new Set(questions.map(q => q.date || new Date(q.createdAt).toLocaleDateString()).filter(Boolean)));

  const filteredAndSortedQuestions = React.useMemo(() => {
    return [...questions]
      .filter(q => {
        if (filterGrade !== 'all' && q.grade !== filterGrade) return false;
        if (filterSubject !== 'all' && q.subject !== filterSubject) return false;
        if (filterDate !== 'all' && (q.date || new Date(q.createdAt).toLocaleDateString()) !== filterDate) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc' || sortBy === 'date-asc') {
          const dateA = a.date ? new Date(`${a.date}T${a.time || '00:00'}`).getTime() : a.createdAt;
          const dateB = b.date ? new Date(`${b.date}T${b.time || '00:00'}`).getTime() : b.createdAt;
          return sortBy === 'date-desc' ? dateB - dateA : dateA - dateB;
        } else if (sortBy === 'subject') {
          const subA = a.subject || '';
          const subB = b.subject || '';
          return subA.localeCompare(subB, 'zh-TW');
        }
        return 0;
      });
  }, [questions, sortBy, filterGrade, filterSubject, filterDate]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredAndSortedQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedQuestions.map(q => q.id)));
    }
  };

  const questionsToPrint = filteredAndSortedQuestions.filter(q => !isSelectionMode || selectedIds.has(q.id));

  const handlePrint = async () => {
    if (isSelectionMode && selectedIds.size === 0) {
      setAlertMessage('請先選擇要匯出/列印的題目');
      return;
    }

    setIsGeneratingPDF(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      let currentY = 0;

      const printContainer = document.querySelector('.pdf-print-container');
      if (printContainer) {
        // Ensure images are loaded
        const images = printContainer.getElementsByTagName('img');
        await Promise.all(Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));
        // Small delay to ensure rendering is complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const renderElementToPdf = async (elementId: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const imgData = await domtoimage.toPng(element, {
          bgcolor: '#ffffff',
          width: element.offsetWidth,
          height: element.offsetHeight,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left'
          }
        });
        
        const h = (element.offsetHeight * pdfWidth) / element.offsetWidth;
        
        if (currentY + h > pdfHeight && currentY > 0) {
          pdf.addPage();
          currentY = 0;
        }
        
        pdf.addImage(imgData, 'PNG', 0, currentY, pdfWidth, h);
        currentY += h;
      };

      // 1. Header
      if (questionsToPrint.length > 0) {
        await renderElementToPdf('print-header');
      }

      // 2. Questions
      for (let i = 0; i < questionsToPrint.length; i++) {
        await renderElementToPdf(`print-q-${questionsToPrint[i].id}`);
      }

      // 3. Notes
      await renderElementToPdf('print-notes');

      pdf.save(`錯題本_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '')}.pdf`);
      setAlertMessage('PDF 匯出成功！您可以直接列印該檔案。');
    } catch (error) {
      console.error('PDF generation failed:', error);
      setAlertMessage(`產生 PDF 失敗，請稍後再試。\n錯誤訊息: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingPDF(false);
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
    <>
      <div className="print:hidden max-w-4xl mx-auto py-8 px-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-stone-100 p-2 rounded-lg">
              <ListFilter className="w-5 h-5 text-stone-600" />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white border border-stone-200 text-stone-700 text-sm rounded-xl focus:ring-2 focus:ring-stone-900/5 outline-none block p-2.5 shadow-sm cursor-pointer"
            >
              <option value="date-desc">排序：日期 (新到舊)</option>
              <option value="date-asc">排序：日期 (舊到新)</option>
              <option value="subject">排序：科目</option>
            </select>

            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="bg-white border border-stone-200 text-stone-700 text-sm rounded-xl focus:ring-2 focus:ring-stone-900/5 outline-none block p-2.5 shadow-sm cursor-pointer"
            >
              <option value="all">所有年級</option>
              {uniqueGrades.map(g => <option key={g} value={g}>{g}年級</option>)}
            </select>

            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="bg-white border border-stone-200 text-stone-700 text-sm rounded-xl focus:ring-2 focus:ring-stone-900/5 outline-none block p-2.5 shadow-sm cursor-pointer"
            >
              <option value="all">所有科目</option>
              {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-white border border-stone-200 text-stone-700 text-sm rounded-xl focus:ring-2 focus:ring-stone-900/5 outline-none block p-2.5 shadow-sm cursor-pointer"
            >
              <option value="all">所有日期</option>
              {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) setSelectedIds(new Set());
              }}
              className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl transition-colors font-medium ${isSelectionMode ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
            >
              <CheckSquare className="w-4 h-4" />
              {isSelectionMode ? '取消選取' : '多選列印'}
            </button>
            
            {isSelectionMode && (
              <>
                <button
                  onClick={selectAll}
                  className="flex items-center gap-2 text-sm bg-stone-100 text-stone-700 hover:bg-stone-200 px-4 py-2.5 rounded-xl transition-colors font-medium"
                >
                  <Square className="w-4 h-4" />
                  {selectedIds.size === filteredAndSortedQuestions.length ? '取消全選' : '全選'}
                </button>
                <button
                  onClick={handlePrint}
                  disabled={isGeneratingPDF}
                  className="flex items-center gap-2 text-sm bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4" />
                  {isGeneratingPDF ? '產生 PDF 中...' : `匯出 PDF (${selectedIds.size})`}
                </button>
              </>
            )}

            {!isSelectionMode && (
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-xl transition-colors font-medium"
              >
                <Trash2 className="w-4 h-4" />
                全部刪除
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedQuestions.map((q) => (
              <motion.div
                key={q.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`group bg-white rounded-3xl border overflow-hidden shadow-sm hover:shadow-md transition-all relative ${isSelectionMode && selectedIds.has(q.id) ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-stone-200'} ${isSelectionMode ? 'cursor-pointer' : ''}`}
                onClick={() => isSelectionMode && toggleSelection(q.id)}
              >
                {isSelectionMode && (
                  <div className="absolute top-3 left-3 z-10">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors ${selectedIds.has(q.id) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-stone-300 text-transparent'}`}>
                      <CheckSquare className="w-4 h-4" />
                    </div>
                  </div>
                )}
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
                  {q.volume && (
                    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                      冊別: {q.volume}
                    </div>
                  )}
                  {q.unit && (
                    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                      單元: {q.unit}
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

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-stone-900">{confirmModal.title}</h3>
              </div>
              <p className="text-stone-600 mb-6">{confirmModal.message}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-medium"
                >
                  確定刪除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert Modal */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setAlertMessage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-stone-900">提示</h3>
              </div>
              <p className="text-stone-600 mb-6">{alertMessage}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setAlertMessage(null)}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition-colors font-medium"
                >
                  我知道了
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Off-screen Print View for PDF Generation */}
      <div className="absolute opacity-0 pointer-events-none pdf-print-container" style={{ left: '-9999px', top: 0, width: '210mm', backgroundColor: '#ffffff' }}>
        <style dangerouslySetInnerHTML={{__html: `
          .pdf-print-container * {
            border-width: 0 !important;
            border-style: none !important;
            box-shadow: none !important;
            outline: none !important;
          }
          .pdf-print-container .print-border-bottom {
            border-bottom-width: 2px !important;
            border-bottom-style: solid !important;
            border-bottom-color: #000000 !important;
          }
          .pdf-print-container .print-border-bottom-light {
            border-bottom-width: 1px !important;
            border-bottom-style: solid !important;
            border-bottom-color: #999999 !important;
          }
        `}} />
        
        {/* Header */}
        {questionsToPrint.length > 0 && (() => {
          const printInfo = questionsToPrint.find(q => q.subject || q.grade || q.volume || q.unit) || questionsToPrint[0];
          return (
            <div id="print-header" style={{ padding: '20px 32px 10px 80px', width: '210mm', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#000000', fontFamily: 'sans-serif' }}>
              <div className="print-border-bottom" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                  <div style={{ display: 'flex', gap: '24px' }}>
                    {printInfo.subject && <span>科目: {printInfo.subject}</span>}
                    {printInfo.grade && <span>年級: {printInfo.grade}</span>}
                    {!printInfo.subject && !printInfo.grade && !printInfo.volume && !printInfo.unit && <span>錯題練習卷</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <span>冊別: {printInfo.volume || '\u00A0\u00A0\u00A0\u00A0\u00A0'}</span>
                    <span>單元: {printInfo.unit || '\u00A0\u00A0\u00A0\u00A0\u00A0'}</span>
                  </div>
                </div>
                <div style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  <span>錯題類型:</span>
                  <span>O資優題</span>
                  <span>O觀念不清/混淆</span>
                  <span>O審題</span>
                  <span>O計算錯誤</span>
                  <span>O粗心（&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;）</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Questions */}
        {questionsToPrint.map((q) => (
          <div 
            key={q.id} 
            id={`print-q-${q.id}`}
            style={{ padding: '16px 32px 16px 80px', width: '210mm', boxSizing: 'border-box', backgroundColor: '#ffffff' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img 
                src={q.processedUrl} 
                alt="Question" 
                style={{ maxWidth: '100%', objectFit: 'contain' }}
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        ))}

        {/* Notes */}
        <div id="print-notes" style={{ padding: '20px 32px 32px 80px', width: '210mm', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#000000', fontFamily: 'sans-serif' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>筆記:</div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="print-border-bottom-light" key={i} style={{ height: '32px', marginBottom: '8px' }}></div>
          ))}
        </div>
      </div>
    </>
  );
}
