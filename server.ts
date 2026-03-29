import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import https from "https";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Handle image processing via TextIn API
  app.post("/api/process-image", express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }), async (req, res) => {
    try {
      const appId = req.headers['x-ti-app-id'] as string;
      const secretCode = req.headers['x-ti-secret-code'] as string;

      if (!appId || !secretCode) {
        return res.status(400).json({ error: "TextIn API credentials not provided in headers." });
      }

      if (!req.body || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: "No image data provided." });
      }

      const textInUrl = 'https://api.textin.com/ai/service/v1/handwritten_erase';
      
      const responseText = await new Promise<string>((resolve, reject) => {
        const url = new URL(textInUrl);
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'x-ti-app-id': appId,
            'x-ti-secret-code': secretCode,
            'Content-Type': 'application/octet-stream',
            'Content-Length': req.body.length,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };

        const request = https.request(options, (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () => {
            resolve(data);
          });
        });

        request.on('error', (error) => {
          console.error("HTTPS Request Error:", error);
          reject(error);
        });

        request.write(req.body);
        request.end();
      });

      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (e) {
        console.error("TextIn API returned non-JSON response:", responseText.substring(0, 200));
        return res.status(500).json({ error: "TextIn API returned an invalid response format. Please check your API credentials or try again later." });
      }

      if (parsedData.code === 200 && parsedData.result && parsedData.result.image) {
        res.json({ image: `data:image/jpeg;base64,${parsedData.result.image}` });
      } else {
        console.error("TextIn API Error Response:", parsedData);
        res.status(500).json({ error: parsedData.message || "Failed to process image with TextIn API." });
      }

    } catch (error: any) {
      console.error("Error processing image:", error);
      res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
