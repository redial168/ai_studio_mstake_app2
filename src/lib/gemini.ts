import { GoogleGenAI, Type } from "@google/genai";

export async function detectQuestionsWithAI(base64Image: string, mimeType: string): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI 處理逾時 (超過 120 秒)，請嘗試在更強的網路環境下重試。')), 120000);
  });

  const apiCallPromise = (async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
      text: 'Analyze this image of a test paper. Identify each individual question. A question typically includes the question number, the question text, any associated diagrams or images, and the multiple-choice options or answer space. Return a JSON array of bounding boxes for each question. The bounding boxes should be in the format [ymin, xmin, ymax, xmax] normalized from 0 to 1000. \n\nCRITICAL: \n1. Ensure the horizontal bounds (xmin, xmax) are EXTREMELY generous. \n2. For any question that spans a line, set xmin to 0 and xmax to 1000 to ensure NO text is cut off at the start or end. \n3. Do not cut off the start or end of the sentences.'
        },
        {
          inlineData: {
            data: base64Image.split(',')[1],
            mimeType: mimeType,
          },
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.NUMBER
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    try {
      const bboxes = JSON.parse(text);
      if (Array.isArray(bboxes)) {
        return bboxes;
      }
      return [];
    } catch (e) {
      console.error("Failed to parse bounding boxes", e);
      return [];
    }
  })();

  return Promise.race([apiCallPromise, timeoutPromise]);
}

export async function removeHandwritingWithAI(base64Image: string, mimeType: string, modelName: string = 'gemini-2.5-flash-image'): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI 處理逾時 (超過 120 秒)，請嘗試在更強的網路環境下重試。')), 120000);
  });

  const apiCallPromise = (async () => {
    const prompt = `Task: Clean this academic question image.
- REMOVE all handwriting, ink marks, and student-added annotations (red, blue, black ink, pencil).
- DO NOT "reconstruct", "type out", or "convert" handwriting into printed text. Simply erase it and leave the area white.
- CRITICAL: PRESERVE every single character of the original printed text. Do not omit the start or end of the question.
- The input image is a square containing the question in the center. 
- DO NOT CROP or resize the image. The output image MUST have the EXACT same dimensions (width and height) as the input image.
- PRESERVE every single character of the original printed text, especially at the very beginning and very end of lines.
- The output must be a clean, high-contrast image with a pure white background.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          }
        ],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("AI 未能生成圖片");
  })();

  return Promise.race([apiCallPromise, timeoutPromise]);
}

