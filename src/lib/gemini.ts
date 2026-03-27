import { GoogleGenAI, Type } from "@google/genai";

export async function removeHandwritingWithAI(base64Image: string, mimeType: string): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI 處理逾時 (超過 120 秒)，請嘗試在更強的網路環境下重試。')), 120000);
  });

  const apiCallPromise = (async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          text: 'Analyze this image of a test paper. Find all handwritten marks (pen, pencil, red ink, checkmarks, crosses, handwritten answers, circles, underlines drawn by hand). Return a JSON array of bounding boxes [ymin, xmin, ymax, xmax] normalized from 0 to 1000. If there are no handwritten marks, return an empty array []. CRITICAL: Ensure the bounding boxes fully cover all handwritten strokes. It is completely OK if the bounding boxes overlap with printed text, question numbers, or parentheses, because we will use a color filter to preserve the printed text later. Just make sure NO handwriting is left outside the boxes.'
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

