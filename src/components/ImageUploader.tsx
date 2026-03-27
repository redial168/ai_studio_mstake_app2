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
  
  const [tool, setTool] = useState<'view' | 'select'>('select');
  const [selections, setSelections] = useState<{ id: string, x: number, y: number, w: number, h: number }[]>([]);
  const [currentRect, setCurrentRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [logs, setLogs] = useState<{ time: string, msg: string, type: 'info' | 'error' | 'success' }[]>([]);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  
  // Advanced erasure parameters
  const [bboxPadding, setBboxPadding] = useState(8);
  const [darknessOffset, setDarknessOffset] = useState(40);
  const [saturationThreshold, setSaturationThreshold] = useState(20);
  
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
      
      // Resize image before displaying to ensure manageable resolution and avoid timeouts
      try {
        const base64 = await fileToBase64(selectedFile);
        // Use 2000px as max dimension for better balance between quality and performance
        const resizedBase64 = await resizeImage(base64, 2000, 2000);
        setOriginalUrl(resizedBase64);
      } catch (err) {
        console.error('Failed to process image:', err);
        setOriginalUrl(URL.createObjectURL(selectedFile));
      } finally {
        setIsImageLoading(false);
      }
      
      setProcessedUrl(null);
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
    const canvas = document.createElement('canvas');
    
    // Use a slightly larger margin (10%) to account for minor AI shifts
    const marginW = Math.floor(rect.w * 0.1);
    const marginH = Math.floor(rect.h * 0.1);
    
    const x1 = Math.max(0, Math.floor(rect.x - marginW));
    const y1 = Math.max(0, Math.floor(rect.y - marginH));
    const x2 = Math.min(sourceCanvas.width, Math.ceil(rect.x + rect.w + marginW));
    const y2 = Math.min(sourceCanvas.height, Math.ceil(rect.y + rect.h + marginH));
    
    const w = x2 - x1;
    const h = y2 - y1;
    
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Use better image smoothing for the crop
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(sourceCanvas, x1, y1, w, h, 0, 0, w, h);
    }
    
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const eraseBboxesFromImage = (base64Str: string, bboxes: number[][], padding: number, darknessOffset: number, saturationThreshold: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
        
        ctx.drawImage(img, 0, 0);
        
        // 1. Calculate global background color and dynamic printed text threshold
        const fullImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const fullData = fullImgData.data;
        let bgR = 255, bgG = 255, bgB = 255;
        let lightPixelCount = 0;
        let sumR = 0, sumG = 0, sumB = 0;
        let minGray = 255;
        
        for (let i = 0; i < fullData.length; i += 4) {
          const r = fullData[i];
          const g = fullData[i + 1];
          const b = fullData[i + 2];
          const gray = (r + g + b) / 3;
          
          if (gray < minGray) minGray = gray;
          
          // Paper is usually the lightest part of the image
          if (gray > 160) { 
            sumR += r; sumG += g; sumB += b;
            lightPixelCount++;
          }
        }
        
        if (lightPixelCount > 0) {
          bgR = sumR / lightPixelCount;
          bgG = sumG / lightPixelCount;
          bgB = sumB / lightPixelCount;
        }
        
        // Printed text threshold is slightly above the darkest pixel in the image
        // This ensures we preserve printed text even in poorly lit photos, 
        // while still erasing pencil (lighter gray) and black pen (often slightly lighter than printed text)
        const printedTextThreshold = Math.min(150, minGray + darknessOffset);
        
        // 2. Process each bounding box
        for (const bbox of bboxes) {
          if (bbox.length !== 4) continue;
          const [ymin, xmin, ymax, xmax] = bbox;
          
          // Convert normalized coordinates (0-1000) to pixel coordinates
          const x = (xmin / 1000) * canvas.width;
          const y = (ymin / 1000) * canvas.height;
          const w = ((xmax - xmin) / 1000) * canvas.width;
          const h = ((ymax - ymin) / 1000) * canvas.height;
          
          const startX = Math.max(0, Math.floor(x - padding));
          const startY = Math.max(0, Math.floor(y - padding));
          const endX = Math.min(canvas.width, Math.ceil(x + w + padding));
          const endY = Math.min(canvas.height, Math.ceil(y + h + padding));
          const boxW = endX - startX;
          const boxH = endY - startY;
          
          if (boxW <= 0 || boxH <= 0) continue;

          // Get image data for the bounding box
          const imgData = ctx.getImageData(startX, startY, boxW, boxH);
          const data = imgData.data;
          
          // Erase handwriting and preserve printed text
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const gray = (r + g + b) / 3;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max - min;
            
            // STRICTER printed text check:
            // Must be VERY dark (gray < printedTextThreshold) and VERY neutral (saturation < saturationThreshold)
            // This ensures pencil (gray > 100) and black pen (often slightly blue/brown or lighter) are erased.
            const isPrintedText = gray < printedTextThreshold && saturation < saturationThreshold;
            
            if (!isPrintedText) {
              // Replace non-printed-text pixels with the global background color
              data[i] = bgR;     // R
              data[i + 1] = bgG; // G
              data[i + 2] = bgB; // B
            }
          }
          
          ctx.putImageData(imgData, startX, startY);
        }
        
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
    });
  };

  const autoCropWhiteBackground = (base64Str: string, padding: number = 20): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;
        
        // Find non-white pixels (threshold 240 to account for compression artifacts)
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            if (r < 240 || g < 240 || b < 240) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        
        // If the image is completely white or empty, return original
        if (minX > maxX || minY > maxY) {
          return resolve(base64Str);
        }
        
        // Add padding
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(canvas.width, maxX + padding);
        maxY = Math.min(canvas.height, maxY + padding);
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.fillStyle = '#FFFFFF';
          cropCtx.fillRect(0, 0, width, height);
          cropCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
          resolve(cropCanvas.toDataURL('image/jpeg', 0.95));
        } else {
          resolve(base64Str);
        }
      };
    });
  };

  const handleBatchProcess = async () => {
    if (!file || selections.length === 0 || !canvasRef.current) return;
    setIsProcessing(true);
    setLogs([]);
    addLog(`🚀 開始批次處理 ${selections.length} 個題目區塊...`);
    
    try {
      const sourceCanvas = canvasRef.current;
      
      for (let i = 0; i < selections.length; i++) {
        setProcessingIndex(i);
        const rect = selections[i];
        addLog(`📝 正在處理第 ${i + 1} 個區塊...`);
        
        // 1. Crop directly from canvas
        const croppedBase64 = cropFromCanvas(sourceCanvas, rect);
        
        // 2. AI Process (Detect Handwriting Bounding Boxes)
        addLog(`🤖 正在呼叫 AI 偵測第 ${i + 1} 個區塊的筆跡...`);
        const bboxes = await removeHandwritingWithAI(croppedBase64, 'image/jpeg');
        
        // 3. Draw white rectangles over handwriting
        addLog(`🖌️ 正在清除第 ${i + 1} 個區塊的筆跡...`);
        const cleanedBase64 = await eraseBboxesFromImage(croppedBase64, bboxes, bboxPadding, darknessOffset, saturationThreshold);
        
        // 4. Auto-crop the white background to perfectly frame the text
        addLog(`✂️ 正在精確裁切第 ${i + 1} 個區塊的邊界...`);
        const processedCrop = await autoCropWhiteBackground(cleanedBase64, 20);
        
        // 3. Save
        addLog(`💾 正在儲存第 ${i + 1} 個題目...`);
        await saveQuestion({
          studentId,
          originalUrl: croppedBase64,
          processedUrl: processedCrop,
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

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool !== 'select' || isProcessing) return;
    if ('touches' in e) e.preventDefault();
    isDrawing.current = true;
    const pos = getCanvasPos(e);
    startPos.current = pos;
    setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const stopDrawing = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'touches' in e) e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentRect && currentRect.w > 10 && currentRect.h > 10) {
      setSelections(prev => [...prev, { ...currentRect, id: Math.random().toString(36).substr(2, 9) }]);
    }
    setCurrentRect(null);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || tool !== 'select' || isProcessing) return;
    if ('touches' in e) e.preventDefault();
    const currentPos = getCanvasPos(e);
    const x = Math.min(startPos.current.x, currentPos.x);
    const y = Math.min(startPos.current.y, currentPos.y);
    const w = Math.abs(startPos.current.x - currentPos.x);
    const h = Math.abs(startPos.current.y - currentPos.y);
    setCurrentRect({ x, y, w, h });
  };

  const removeSelection = (id: string) => {
    setSelections(prev => prev.filter(s => s.id !== id));
  };

  useEffect(() => {
    if (originalUrl && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = originalUrl;
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
      };
    }
  }, [originalUrl]);

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
                <span className="text-[10px] bg-stone-900 text-white px-2 py-0.5 rounded-full font-bold">
                  已選取 {selections.length} 個區塊
                </span>
                {selections.length > 0 && !isProcessing && (
                  <button 
                    onClick={() => setSelections([])}
                    className="text-[10px] text-red-500 hover:underline"
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
              <div className="relative inline-block">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className={`max-w-full max-h-[70vh] w-auto h-auto block ${tool === 'select' && !isProcessing ? 'cursor-crosshair' : 'cursor-default'}`}
                />
                
                {/* Existing Selections */}
                {selections.map((s, i) => (
                  <div 
                    key={s.id}
                    className={`absolute border-2 transition-all flex items-start justify-end p-1 ${
                      processingIndex === i 
                        ? 'border-amber-500 bg-amber-500/20 animate-pulse' 
                        : i < (processingIndex ?? -1)
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-stone-900 bg-stone-900/10'
                    }`}
                    style={{
                      left: `${(s.x / (canvasRef.current?.width || 1)) * 100}%`,
                      top: `${(s.y / (canvasRef.current?.height || 1)) * 100}%`,
                      width: `${(s.w / (canvasRef.current?.width || 1)) * 100}%`,
                      height: `${(s.h / (canvasRef.current?.height || 1)) * 100}%`,
                    }}
                  >
                    {!isProcessing && (
                      <button 
                        onClick={() => removeSelection(s.id)}
                        className="bg-stone-900 text-white p-1 rounded-md hover:bg-red-500 transition-colors shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <div className="absolute top-0 left-0 bg-stone-900 text-white text-[10px] px-1.5 py-0.5 font-bold">
                      #{i + 1}
                    </div>
                  </div>
                ))}

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
                  onClick={() => setIsZoomed(originalUrl)}
                  className="p-2 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg hover:bg-white transition-colors"
                  title="放大查看原圖"
                >
                  <Maximize2 className="w-5 h-5 text-stone-600" />
                </button>
              </div>
              
              {/* Tooltip */}
              {!isProcessing && selections.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-sm border border-stone-200 flex items-center gap-2 text-stone-500 text-sm">
                    <Square className="w-4 h-4" />
                    請在考卷上拖曳滑鼠來選取題目
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
                      <span>正在處理中，請勿關閉視窗...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Advanced Erasure Parameters */}
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
              <Sparkles className="w-5 h-5 text-stone-400" />
              <h3 className="font-semibold text-stone-800">進階去痕參數設定</h3>
              <span className="text-xs text-stone-400 ml-auto">如果去痕效果不佳，可以嘗試調整以下參數</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-stone-600">消除範圍擴張 (Padding)</label>
                  <span className="text-xs font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">{bboxPadding}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="30" 
                  value={bboxPadding} 
                  onChange={(e) => setBboxPadding(Number(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-800"
                />
                <p className="text-[10px] text-stone-400 leading-tight">數值越大，消除的範圍越廣，能清除邊緣殘留的筆跡，但可能誤傷周圍文字。</p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-stone-600">印刷文字深淺閥值 (Darkness)</label>
                  <span className="text-xs font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">+{darknessOffset}</span>
                </div>
                <input 
                  type="range" 
                  min="10" max="100" 
                  value={darknessOffset} 
                  onChange={(e) => setDarknessOffset(Number(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-800"
                />
                <p className="text-[10px] text-stone-400 leading-tight">數值越大，保留的文字越多（較淺的字也會被當作印刷字保留），但可能導致較深的鉛筆或黑筆字跡去不乾淨。</p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-stone-600">色彩容忍度 (Color Tolerance)</label>
                  <span className="text-xs font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">{saturationThreshold}</span>
                </div>
                <input 
                  type="range" 
                  min="5" max="50" 
                  value={saturationThreshold} 
                  onChange={(e) => setSaturationThreshold(Number(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-800"
                />
                <p className="text-[10px] text-stone-400 leading-tight">數值越大，允許保留帶有微小色彩的文字，但可能導致褪色的紅/藍筆跡無法被清除。</p>
              </div>
            </div>
          </div>

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
