import React, { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Check, Save, Eraser, MousePointer2, Square, Info, Sparkles, Maximize2, X, Terminal, ScanSearch } from 'lucide-react';
import { saveQuestion } from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';

const processImageWithTextIn = async (base64Str: string, appId: string, secretCode: string): Promise<string> => {
  try {
    // Convert base64 to Blob
    const res = await fetch(base64Str);
    const blob = await res.blob();

    const headers: Record<string, string> = {
      'Content-Type': blob.type || 'image/jpeg'
    };
    
    if (appId) headers['x-ti-app-id'] = appId;
    if (secretCode) headers['x-ti-secret-code'] = secretCode;

    const response = await fetch('/api/process-image', {
      method: 'POST',
      body: blob,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to process image with TextIn API');
    }

    const data = await response.json();
    return data.image;
  } catch (error) {
    console.error('TextIn API Error:', error);
    throw error;
  }
};

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey?: () => Promise<boolean>;
      openSelectKey?: () => Promise<void>;
    };
  }
}

export function ImageUploader({ studentId, onSaveSuccess }: { studentId: string, onSaveSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isZoomed, setIsZoomed] = useState<string | null>(null);
  
  const [appId, setAppId] = useState(() => localStorage.getItem('textin_app_id') || '04a82ed156a5c03d050812b59dbf90eb');
  const [secretCode, setSecretCode] = useState(() => localStorage.getItem('textin_secret_code') || '027c712c6f55fc37f447f6b3b3159421');
  const [skipTextIn, setSkipTextIn] = useState(() => localStorage.getItem('skip_textin') === 'true');

  useEffect(() => {
    localStorage.setItem('textin_app_id', appId);
    localStorage.setItem('textin_secret_code', secretCode);
    localStorage.setItem('skip_textin', skipTextIn.toString());
  }, [appId, secretCode, skipTextIn]);

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
  
  const [tool, setTool] = useState<'view' | 'select'>('select');
  const [selections, setSelections] = useState<{ id: string, x: number, y: number, w: number, h: number }[]>([]);
  const [currentRect, setCurrentRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [logs, setLogs] = useState<{ time: string, msg: string, type: 'info' | 'error' | 'success' }[]>([]);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  
  const [isImageLoading, setIsImageLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, msg, type }]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setSelections([]); // Clear previous selections when new file is uploaded
      setLogs([]);
      setIsImageLoading(true);
      
      try {
        addLog('📸 讀取圖片中...');
        const base64 = await fileToBase64(selectedFile);
        // Resize image before displaying to ensure manageable resolution and avoid timeouts
        const resizedBase64 = await resizeImage(base64, 2000, 2000);
        setOriginalUrl(resizedBase64);
        
        // Get original dimensions to ensure processed image matches exactly
        const origImg = new Image();
        origImg.src = resizedBase64;
        await new Promise((resolve) => { origImg.onload = resolve; });
        const origWidth = origImg.width;
        const origHeight = origImg.height;
        
        let cleanedBase64 = resizedBase64;
        if (!skipTextIn) {
          addLog('🤖 正在呼叫 TextIn API 去除筆跡與優化底色...');
          cleanedBase64 = await processImageWithTextIn(resizedBase64, appId, secretCode);
        } else {
          addLog('⏭️ 測試模式：已跳過 TextIn API 處理');
        }
        
        addLog('✨ 正在優化圖片對比度...');
        const whitenedBase64 = await whitenBackground(cleanedBase64, origWidth, origHeight);
        
        setProcessedUrl(whitenedBase64);
        addLog('✅ 圖片處理完成，請開始框選題目！', 'success');
      } catch (err) {
        console.error('Failed to process image:', err);
        const errorMsg = err instanceof Error ? err.message : '未知錯誤';
        addLog(`❌ 圖片處理失敗: ${errorMsg}`, 'error');
        // Fallback to original if processing fails
        if (!originalUrl) {
          const fallbackUrl = URL.createObjectURL(selectedFile);
          setOriginalUrl(fallbackUrl);
          setProcessedUrl(fallbackUrl);
        }
      } finally {
        setIsImageLoading(false);
      }
      
      setTool('select');
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
        // 提高品質至 0.85 以確保使用者選取時文字清晰
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
    });
  };

  const cropFromCanvas = (sourceCanvas: HTMLCanvasElement, rect: { x: number, y: number, w: number, h: number }): string => {
    // Use a small margin to ensure we don't cut off the edges of the selection
    const margin = 15;
    
    const x1 = Math.max(0, Math.floor(rect.x - margin));
    const y1 = Math.max(0, Math.floor(rect.y - margin));
    const x2 = Math.min(sourceCanvas.width, Math.ceil(rect.x + rect.w + margin));
    const y2 = Math.min(sourceCanvas.height, Math.ceil(rect.y + rect.h + margin));
    
    const w = x2 - x1;
    const h = y2 - y1;
    
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(sourceCanvas, x1, y1, w, h, 0, 0, w, h);
    }
    
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const whitenBackground = (base64Str: string, targetWidth?: number, targetHeight?: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth || img.width;
        canvas.height = targetHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // White point adjustment: 
        // We assume anything above 220 is background noise and should be pure white.
        // This lightens the entire image while preserving the relative contrast of the text.
        const whitePoint = 220;
        const factor = 255 / whitePoint;
        
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * factor);
          data[i+1] = Math.min(255, data[i+1] * factor);
          data[i+2] = Math.min(255, data[i+2] * factor);
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
    });
  };

  const handleBatchProcess = async () => {
    if (!file || selections.length === 0 || !canvasRef.current || !originalUrl || !processedUrl) return;
    setIsProcessing(true);
    setLogs([]);
    addLog(`🚀 開始批次處理 ${selections.length} 個題目區塊...`);
    
    try {
      // The main canvas currently displays the processed image
      const processedCanvas = canvasRef.current;
      
      // Create an offscreen canvas for the original image
      const originalImg = new Image();
      originalImg.src = originalUrl;
      await new Promise((resolve) => { originalImg.onload = resolve; });
      const originalCanvas = document.createElement('canvas');
      originalCanvas.width = originalImg.width;
      originalCanvas.height = originalImg.height;
      const originalCtx = originalCanvas.getContext('2d');
      originalCtx?.drawImage(originalImg, 0, 0);
      
      for (let i = 0; i < selections.length; i++) {
        setProcessingIndex(i);
        const rect = selections[i];
        addLog(`📝 正在處理第 ${i + 1} 個區塊...`);
        
        // Crop from processed canvas for the question
        addLog(`✂️ 正在裁切第 ${i + 1} 個區塊的題目圖片...`);
        const finalProcessedBase64 = cropFromCanvas(processedCanvas, rect);
        
        // Crop from original canvas for the answer
        addLog(`✂️ 正在裁切第 ${i + 1} 個區塊的原始圖片(解答)...`);
        const finalOriginalBase64 = cropFromCanvas(originalCanvas, rect);
        
        // Save
        addLog(`💾 正在儲存第 ${i + 1} 個題目...`);
        await saveQuestion({
          studentId,
          originalUrl: finalOriginalBase64,
          processedUrl: finalProcessedBase64,
          subject: subject === '其他' ? customSubject : subject,
          grade,
          date,
          time,
          remarks: selections.length > 1 ? `${remarks} (區塊 ${i + 1})`.trim() : remarks.trim() || undefined,
        });
        
        addLog(`✅ 第 ${i + 1} 個題目儲存成功！`, 'success');
      }
      
      addLog('🎉 所有選取區塊處理完成！', 'success');
      setFile(null);
      setOriginalUrl(null);
      setProcessedUrl(null);
      setSelections([]);
      setRemarks('');
      setCustomSubject('');
      onSaveSuccess();
    } catch (err) {
      console.error('Batch processing failed:', err);
      const errorMsg = err instanceof Error ? err.message : '未知錯誤';
      addLog(`❌ 處理失敗: ${errorMsg}`, 'error');
    } finally {
      setIsProcessing(false);
      setProcessingIndex(null);
    }
  };

  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);
  const dragInfo = useRef<{ mode: string, id: string, startX: number, startY: number, origRect: {x: number, y: number, w: number, h: number} } | null>(null);

  const startInteraction = (e: React.MouseEvent | React.TouchEvent, mode: string, id?: string) => {
    if (tool !== 'select' || isProcessing) return;
    if ('touches' in e) e.preventDefault();
    
    const pos = getCanvasPos(e);
    
    if (mode === 'draw') {
      isDrawing.current = true;
      startPos.current = pos;
      setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      setActiveSelectionId(null);
    } else if (id) {
      e.stopPropagation(); // prevent canvas click
      const rect = selections.find(s => s.id === id);
      if (rect) {
        setActiveSelectionId(id);
        dragInfo.current = { mode, id, startX: pos.x, startY: pos.y, origRect: { ...rect } };
      }
    }
  };

  const handleInteractionMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool !== 'select' || isProcessing) return;
    
    if (isDrawing.current) {
      if ('touches' in e) e.preventDefault();
      const currentPos = getCanvasPos(e);
      const x = Math.min(startPos.current.x, currentPos.x);
      const y = Math.min(startPos.current.y, currentPos.y);
      const w = Math.abs(startPos.current.x - currentPos.x);
      const h = Math.abs(startPos.current.y - currentPos.y);
      setCurrentRect({ x, y, w, h });
    } else if (dragInfo.current) {
      if ('touches' in e) e.preventDefault();
      const currentPos = getCanvasPos(e);
      const { mode, id, startX, startY, origRect } = dragInfo.current;
      const dx = currentPos.x - startX;
      const dy = currentPos.y - startY;
      
      setSelections(prev => prev.map(s => {
        if (s.id !== id) return s;
        let newRect = { ...origRect };
        
        if (mode === 'move') {
          newRect.x = Math.max(0, Math.min((canvasRef.current?.width || 0) - newRect.w, origRect.x + dx));
          newRect.y = Math.max(0, Math.min((canvasRef.current?.height || 0) - newRect.h, origRect.y + dy));
        } else if (mode === 'tl') {
          newRect.x = Math.min(origRect.x + origRect.w - 10, Math.max(0, origRect.x + dx));
          newRect.y = Math.min(origRect.y + origRect.h - 10, Math.max(0, origRect.y + dy));
          newRect.w = origRect.x + origRect.w - newRect.x;
          newRect.h = origRect.y + origRect.h - newRect.y;
        } else if (mode === 'tr') {
          newRect.y = Math.min(origRect.y + origRect.h - 10, Math.max(0, origRect.y + dy));
          newRect.w = Math.max(10, Math.min((canvasRef.current?.width || 0) - origRect.x, origRect.w + dx));
          newRect.h = origRect.y + origRect.h - newRect.y;
        } else if (mode === 'bl') {
          newRect.x = Math.min(origRect.x + origRect.w - 10, Math.max(0, origRect.x + dx));
          newRect.w = origRect.x + origRect.w - newRect.x;
          newRect.h = Math.max(10, Math.min((canvasRef.current?.height || 0) - origRect.y, origRect.h + dy));
        } else if (mode === 'br') {
          newRect.w = Math.max(10, Math.min((canvasRef.current?.width || 0) - origRect.x, origRect.w + dx));
          newRect.h = Math.max(10, Math.min((canvasRef.current?.height || 0) - origRect.y, origRect.h + dy));
        }
        
        return newRect;
      }));
    }
  };

  const stopInteraction = (e?: React.MouseEvent | React.TouchEvent) => {
    if (isDrawing.current) {
      if (e && 'touches' in e) e.preventDefault();
      isDrawing.current = false;
      if (currentRect && currentRect.w > 10 && currentRect.h > 10) {
        const newId = Math.random().toString(36).substr(2, 9);
        setSelections(prev => [...prev, { ...currentRect, id: newId }]);
        setActiveSelectionId(newId);
      }
      setCurrentRect(null);
    } else if (dragInfo.current) {
      if (e && 'touches' in e) e.preventDefault();
      dragInfo.current = null;
    }
  };

  const removeSelection = (id: string) => {
    setSelections(prev => prev.filter(s => s.id !== id));
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
    
    // Get computed styles to account for borders and padding
    const style = window.getComputedStyle(canvas);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    
    // The actual display size of the canvas content area
    const displayWidth = rect.width - borderLeft - (parseFloat(style.borderRightWidth) || 0) - paddingLeft - (parseFloat(style.paddingRight) || 0);
    const displayHeight = rect.height - borderTop - (parseFloat(style.borderBottomWidth) || 0) - paddingTop - (parseFloat(style.paddingBottom) || 0);
    
    // Mapping factor from CSS pixels to internal canvas pixels
    const scaleX = displayWidth > 0 ? canvas.width / displayWidth : 1;
    const scaleY = displayHeight > 0 ? canvas.height / displayHeight : 1;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Calculate position relative to the content area of the canvas
    const x = (clientX - rect.left - borderLeft - paddingLeft) * scaleX;
    const y = (clientY - rect.top - borderTop - paddingTop) * scaleY;

    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y))
    };
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* API Settings */}
      {!originalUrl && (
        <div className="mb-8 p-5 bg-stone-50 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-sm font-bold text-stone-700 mb-4 flex items-center gap-2">
            <Terminal className="w-4 h-4" /> TextIn API 設定
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">App ID</label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none transition-all"
                placeholder="輸入 x-ti-app-id"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Secret Code</label>
              <input
                type="password"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900/5 outline-none transition-all"
                placeholder="輸入 x-ti-secret-code"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="skipTextIn"
              checked={skipTextIn}
              onChange={(e) => setSkipTextIn(e.target.checked)}
              className="w-4 h-4 text-stone-900 rounded border-stone-300 focus:ring-stone-900"
            />
            <label htmlFor="skipTextIn" className="text-sm text-stone-600 font-medium cursor-pointer">
              測試模式：跳過 TextIn API 處理 (不扣除額度)
            </label>
          </div>
        </div>
      )}

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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
                {isProcessing ? '正在批次處理中...' : '請在考卷上框選題目區塊 (可多選)'}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-stone-900 text-white px-2 py-1 rounded-full font-bold">
                  已選取 {selections.length} 個區塊
                </span>
                {selections.length > 0 && !isProcessing && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelections([]);
                    }}
                    className="text-[10px] text-red-500 hover:text-red-700 hover:underline px-1 font-medium"
                  >
                    全部清除
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-stone-100 rounded-3xl overflow-hidden border border-stone-200 relative group shadow-inner flex items-center justify-center min-h-[400px]">
              {isImageLoading && (
                <div className="absolute inset-0 z-10 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
                  <p className="text-sm text-stone-500 font-medium">正在優化圖片解析度...</p>
                </div>
              )}
              <div 
                className="relative inline-block"
                onMouseMove={handleInteractionMove}
                onMouseUp={stopInteraction}
                onMouseLeave={stopInteraction}
                onTouchMove={handleInteractionMove}
                onTouchEnd={stopInteraction}
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={(e) => startInteraction(e, 'draw')}
                  onTouchStart={(e) => startInteraction(e, 'draw')}
                  className={`max-w-full max-h-[70vh] w-auto h-auto block ${tool === 'select' && !isProcessing ? 'cursor-crosshair' : 'cursor-default'}`}
                />
                
                {/* Existing Selections */}
                {selections.map((s, i) => {
                  const isActive = activeSelectionId === s.id;
                  return (
                    <div 
                      key={s.id}
                      onMouseDown={(e) => startInteraction(e, 'move', s.id)}
                      onTouchStart={(e) => startInteraction(e, 'move', s.id)}
                      className={`absolute border-2 transition-all flex items-start justify-end p-1 ${
                        tool === 'select' && !isProcessing ? 'pointer-events-auto cursor-move' : 'pointer-events-none'
                      } ${
                        processingIndex === i 
                          ? 'border-amber-500 bg-amber-500/20 animate-pulse' 
                          : i < (processingIndex ?? -1)
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : isActive
                              ? 'border-blue-500 bg-blue-400/20 z-10'
                              : 'border-stone-900 bg-stone-900/10 hover:bg-stone-900/20'
                      }`}
                      style={{
                        left: `${(s.x / (canvasRef.current?.width || 1)) * 100}%`,
                        top: `${(s.y / (canvasRef.current?.height || 1)) * 100}%`,
                        width: `${(s.w / (canvasRef.current?.width || 1)) * 100}%`,
                        height: `${(s.h / (canvasRef.current?.height || 1)) * 100}%`,
                      }}
                    >
                      {isActive && !isProcessing && (
                        <>
                          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 cursor-nwse-resize" onMouseDown={(e) => startInteraction(e, 'tl', s.id)} onTouchStart={(e) => startInteraction(e, 'tl', s.id)} />
                          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 cursor-nesw-resize" onMouseDown={(e) => startInteraction(e, 'tr', s.id)} onTouchStart={(e) => startInteraction(e, 'tr', s.id)} />
                          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 cursor-nesw-resize" onMouseDown={(e) => startInteraction(e, 'bl', s.id)} onTouchStart={(e) => startInteraction(e, 'bl', s.id)} />
                          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 cursor-nwse-resize" onMouseDown={(e) => startInteraction(e, 'br', s.id)} onTouchStart={(e) => startInteraction(e, 'br', s.id)} />
                        </>
                      )}
                      {!isProcessing && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            removeSelection(s.id);
                          }}
                          className="bg-stone-900 text-white p-1 rounded-md hover:bg-red-500 transition-colors shadow-lg pointer-events-auto relative z-20"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <div className="absolute top-0 left-0 bg-stone-900 text-white text-[10px] px-1.5 py-0.5 font-bold pointer-events-none">
                        #{i + 1}
                      </div>
                    </div>
                  );
                })}

                {/* Current Drawing Rect */}
                {currentRect && (
                  <div 
                    className="absolute border-2 border-dashed border-stone-900 bg-stone-900/5 pointer-events-none"
                    style={{
                      left: `${(currentRect.x / (canvasRef.current?.width || 1)) * 100}%`,
                      top: `${(currentRect.y / (canvasRef.current?.height || 1)) * 100}%`,
                      width: `${(currentRect.w / (canvasRef.current?.width || 1)) * 100}%`,
                      height: `${(currentRect.h / (canvasRef.current?.height || 1)) * 100}%`,
                    }}
                  />
                )}
              </div>

              <div className="absolute bottom-4 right-4 flex gap-2">
                <button 
                  onClick={() => setIsZoomed(processedUrl)}
                  className="p-2 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg hover:bg-white transition-colors"
                  title="放大查看圖片"
                >
                  <Maximize2 className="w-5 h-5 text-stone-600" />
                </button>
              </div>
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
                      <span>正在處理中，請勿關閉視窗...</span>
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
              <button
                onClick={handleBatchProcess}
                disabled={isProcessing || selections.length === 0}
                className="flex-1 bg-stone-900 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 transition-all shadow-lg shadow-stone-200"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                {isProcessing ? `正在處理 (${(processingIndex || 0) + 1}/${selections.length})` : `開始處理並儲存 (${selections.length})`}
              </button>
              
              <button
                onClick={() => {
                  setOriginalUrl(null);
                  setProcessedUrl(null);
                  setSelections([]);
                }}
                disabled={isProcessing}
                className="px-6 py-3 border border-stone-200 rounded-xl font-medium text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all disabled:opacity-50"
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
