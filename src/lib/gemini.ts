import { GoogleGenAI } from "@google/genai";

export async function removeHandwritingWithAI(base64Image: string, mimeType: string): Promise<string> {
  // Use the standard environment key for gemini-2.5-flash-image (Faster, no UI key selection needed)
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  // 建立一個逾時 Promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI 處理逾時 (超過 45 秒)，請檢查網路連線或嘗試縮小圖片後重試。')), 45000);
  });

  // 封裝 API 呼叫
  const apiCallPromise = (async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1], // Remove data:image/png;base64,
              mimeType: mimeType,
            },
          },
          {
            text: '請移除這張考卷圖片中的所有手寫筆跡、勾選、圈選或任何非印刷文字的標記。請保留原始的題目文字、圖形、表格與排版，並將背景處理為乾淨的白色。請直接回傳處理後的圖片。',
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        return `data:image/png;base64,${base64Data}`;
      }
    }

    throw new Error('AI 未能返回處理後的圖片。請確認圖片格式是否正確。');
  })();

  // 使用 Promise.race 進行競爭，若逾時則報錯
  return Promise.race([apiCallPromise, timeoutPromise]);
}
