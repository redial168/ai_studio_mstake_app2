import React, { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Check, Save, Eraser, MousePointer2, Square, Info, Sparkles, Maximize2, X, Terminal } from 'lucide-react';
import { removeHandwritingWithAI } from '../lib/gemini';
import { saveQuestion } from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';

export function ImageUploader({ studentId, onSaveSuccess }: { studentId: string, onSaveSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isZoomed, setIsZoomed] = useState<string | null>(null);
  
  // Structured input state
  const [subject, setSubject] = useState('國文');
  const [customSubject, setCustomSubject] = useState('');
  const [grade, setGrade] = useState('7');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  });
  const [remarks, setRemarks] = useState('');
  
  const [tool, setTool] = useState<'view' | 'eraser' | 'rect'>('view');
  const [brushSize, setBrushSize] = useState(20);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const [rectPos, setRectPos] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [logs, setLogs] = useState<{ time: string, msg: string, type: 'info' | 'error' | 'success' }[]>([]);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, msg, type }]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setOriginalUrl(URL.createObjectURL(selectedFile));
      setProcessedUrl(null);
      setTool('view');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const resizeImage = (base64Str: string, maxWidth = 1280, maxHeight = 1280): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // 降低品質至 0.65 以大幅減少傳輸體積，同時保持文字清晰度
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
    });
  };

  const handleAIProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setLogs([]);
    addLog('🚀 開始 AI 智慧去痕處理...');
    
    try {
      addLog('📂 正在讀取圖片檔案...');
      const rawBase64 = await fileToBase64(file);
      
      addLog('📏 正在優化圖片尺寸以提升處理速度...');
      const optimizedBase64 = await resizeImage(rawBase64);
      addLog(`✅ 圖片優化完成 (大小已縮減至約 ${(optimizedBase64.length / 1024 / 1024).toFixed(2)} MB)`);
      
      addLog('🤖 正在呼叫 Gemini 2.5 Flash Image 模型 (處理整張考卷可能需要 30-60 秒，請稍候)...');
      const result = await removeHandwritingWithAI(optimizedBase64, 'image/jpeg');
      
      addLog('✨ AI 處理完成，正在載入結果圖片...');
      setProcessedUrl(result);
      setTool('view');
      addLog('🎉 處理成功！', 'success');
    } catch (err) {
      console.error('AI Processing failed:', err);
      const errorMsg = err instanceof Error ? err.message : '未知錯誤';
      addLog(`❌ 處理失敗: ${errorMsg}`, 'error');
      alert(`AI 處理失敗: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (processedUrl && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = processedUrl;
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
      };
    }
  }, [processedUrl]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === 'view') return;
    isDrawing.current = true;
    const pos = getCanvasPos(e);
    startPos.current = pos;

    if (tool === 'eraser') {
      draw(e);
    }
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'rect' && rectPos && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(rectPos.x, rectPos.y, rectPos.w, rectPos.h);
        setProcessedUrl(canvasRef.current.toDataURL('image/png'));
      }
      setRectPos(null);
    } else if (canvasRef.current) {
      setProcessedUrl(canvasRef.current.toDataURL('image/png'));
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !canvasRef.current || tool === 'view') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPos = getCanvasPos(e);

    if (tool === 'eraser') {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(currentPos.x, currentPos.y, brushSize * (canvas.width / canvas.clientWidth) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (tool === 'rect') {
      const x = Math.min(startPos.current.x, currentPos.x);
      const y = Math.min(startPos.current.y, currentPos.y);
      const w = Math.abs(startPos.current.x - currentPos.x);
      const h = Math.abs(startPos.current.y - currentPos.y);
      setRectPos({ x, y, w, h });
    }
  };

  const handleSave = async () => {
    if (!originalUrl || !processedUrl) return;
    setIsSaving(true);
    try {
      const finalUrl = canvasRef.current ? canvasRef.current.toDataURL('image/png') : processedUrl;
      await saveQuestion({
        studentId,
        originalUrl,
        processedUrl: finalUrl,
        subject: subject === '其他' ? customSubject : subject,
        grade,
        date,
        time,
        remarks: remarks.trim() || undefined,
      });
      setFile(null);
      setOriginalUrl(null);
      setProcessedUrl(null);
      setRemarks('');
      setCustomSubject('');
      onSaveSuccess();
    } catch (err) {
      console.error('Save failed:', err);
      alert('儲存失敗。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {!originalUrl ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-stone-300 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-all group"
        >
          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8 text-stone-500" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-stone-900">點擊或拖拽上傳考卷照片</p>
            <p className="text-sm text-stone-500">支援 JPG, PNG 格式</p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        </motion.div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">原始圖片</p>
              <div className="aspect-[3/4] bg-stone-100 rounded-2xl overflow-hidden border border-stone-200 relative group">
                <img src={originalUrl} alt="Original" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                <button 
                  onClick={() => setIsZoomed(originalUrl)}
                  className="absolute bottom-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="放大查看"
                >
                  <Maximize2 className="w-4 h-4 text-stone-600" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">處理結果</p>
              <div className="aspect-[3/4] bg-white rounded-2xl overflow-hidden border border-stone-200 flex items-center justify-center relative group">
                {processedUrl ? (
                  <div className="w-full h-full relative group">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className={`w-full h-full object-contain ${tool !== 'view' ? 'cursor-crosshair' : 'cursor-default'}`}
                    />
                    
                    {/* Visual Rect Preview */}
                    {rectPos && tool === 'rect' && (
                      <div 
                        className="absolute border-2 border-stone-900 bg-stone-900/10 pointer-events-none"
                        style={{
                          left: `${(rectPos.x / (canvasRef.current?.width || 1)) * 100}%`,
                          top: `${(rectPos.y / (canvasRef.current?.height || 1)) * 100}%`,
                          width: `${(rectPos.w / (canvasRef.current?.width || 1)) * 100}%`,
                          height: `${(rectPos.h / (canvasRef.current?.height || 1)) * 100}%`,
                        }}
                      />
                    )}

                    <button 
                      onClick={() => setIsZoomed(processedUrl)}
                      className="absolute bottom-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                      title="放大查看"
                    >
                      <Maximize2 className="w-4 h-4 text-stone-600" />
                    </button>
                    
                    {/* Floating Toolbar */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur shadow-lg border border-stone-200 p-2 rounded-full">
                      <button
                        onClick={() => setTool('view')}
                        className={`p-2 rounded-full transition-colors ${tool === 'view' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
                        title="查看模式"
                      >
                        <MousePointer2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setTool('eraser')}
                        className={`p-2 rounded-full transition-colors ${tool === 'eraser' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
                        title="橡皮擦"
                      >
                        <Eraser className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setTool('rect')}
                        className={`p-2 rounded-full transition-colors ${tool === 'rect' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
                        title="矩形清除"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                      
                      {tool === 'eraser' && (
                        <div className="flex items-center gap-2 px-2 border-l border-stone-200">
                          <input
                            type="range"
                            min="5"
                            max="50"
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-16 h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-900"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6">
                    {isProcessing ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
                        <p className="text-sm text-stone-500">正在去除筆跡...</p>
                      </div>
                    ) : (
                      <p className="text-sm text-stone-400 italic">點擊下方按鈕開始處理</p>
                    )}
                  </div>
                )}
              </div>
              {processedUrl && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3">
                  <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 leading-relaxed">
                    <p className="font-bold mb-1">✨ AI 智慧去痕已啟用：</p>
                    <p>目前已切換回速度更快的 <b>Gemini 2.5 Flash Image</b> 模型。它能快速識別並移除筆跡，且無需額外金鑰選擇。如果仍有極少數殘留，可搭配下方的 <b>矩形清除 (<Square className="w-3 h-3 inline" />)</b> 工具手動修正。</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Processing Logs */}
          <AnimatePresence>
            {(logs.length > 0 || isProcessing) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-stone-900 rounded-2xl p-4 font-mono text-[11px] overflow-hidden border border-stone-800 shadow-inner"
              >
                <div className="flex items-center gap-2 mb-2 text-stone-500 border-b border-stone-800 pb-2">
                  <Terminal className="w-3 h-3" />
                  <span className="uppercase tracking-widest">系統處理日誌</span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-stone-600 shrink-0">[{log.time}]</span>
                      <span className={
                        log.type === 'error' ? 'text-red-400' : 
                        log.type === 'success' ? 'text-emerald-400' : 
                        'text-stone-300'
                      }>
                        {log.msg}
                      </span>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex gap-2 items-center text-amber-400/80 animate-pulse">
                      <span className="text-stone-600 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                      <span>正在等待 AI 回應...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">科目</label>
                <div className="flex gap-2">
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="flex-1 p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none"
                  >
                    {['國文', '英文', '數學', '社會', '自然', '其他'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {subject === '其他' && (
                    <input
                      type="text"
                      placeholder="輸入科目"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      className="flex-1 p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Grade */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">年級</label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(g => (
                    <option key={g} value={g}>{g} 年級</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">日期</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none"
                />
              </div>

              {/* Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">時間</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">備註</label>
              <textarea
                placeholder="添加額外備註（例如：難題、需要複習...）"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/5 resize-none h-24"
              />
            </div>

            <div className="flex gap-3">
              {!processedUrl ? (
                <button
                  onClick={handleAIProcess}
                  disabled={isProcessing}
                  className="w-full bg-stone-900 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 transition-all shadow-lg shadow-stone-200"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                  AI 智慧去痕 (推薦)
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setProcessedUrl(null)}
                    className="px-6 py-3 border border-stone-200 rounded-xl font-medium text-stone-600 hover:bg-stone-50 transition-all"
                  >
                    重新處理
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 bg-stone-900 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 transition-all"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    儲存到錯題本
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setOriginalUrl(null);
                  setProcessedUrl(null);
                }}
                className="px-4 py-3 text-stone-400 hover:text-stone-600 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
