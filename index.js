// index.js
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import fetch from "node-fetch"; // Node 18+ has fetch; if using earlier Node use node-fetch

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_KEY; // set this in Render secrets


const SHARED_SECRET = process.env.SHARED_SECRET;   // set this in Render secrets
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // pick desired model

if (!GEMINI_API_KEY || !SHARED_SECRET) {
  console.error("Missing GEMINI_API_KEY or SHARED_SECRET in env. Exiting.");
  process.exit(1);
}

// Simple healthcheck
app.get("/", (req, res) => res.send("Roblox AI proxy is running"));

// Endpoint Roblox calls
app.post("/message", async (req, res) => {
  try {
    const incomingSecret = req.get("x-roblox-secret") || "";
    if (!incomingSecret || incomingSecret !== SHARED_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { playerId, message, context } = req.body || {};
    if (!playerId || !message) {
      return res.status(400).json({ error: "playerId and message are required" });
    }

    // Build the prompt / system instruction. Customize to your game.
    const systemPrompt = `You are an in-game AI assistant for a Roblox game. Be friendly, short, and provide helpful game-appropriate responses. Keep replies under 200 characters unless asked for more.`;

    // Use Google Gen AI SDK pattern via REST as fallback or fetch to the REST endpoint.
    // We'll call the Generative Language REST endpoint (v1beta models generateContent).
    // NOTE: if you prefer the official npm SDK (@google/genai), swap this out accordingly.

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

    const body = {
      // simple text-only prompt. For richer prompts, adapt to the gemini API schema.
      prompt: {
        text: `${systemPrompt}\n\nPlayer (${playerId}): ${message}\nAI:`
      },
      // you can set other params here depending on model (temperature, safety, etc.)
    };

    const resp = await fetch(`${url}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Gemini error:", resp.status, text);
      return res.status(500).json({ error: "Model request failed", details: text });
    }

    const data = await resp.json();
    // Different Gemini SDKs/versions return model text in different fields.
    // Try a few common places:
    let reply = null;
    // common REST shape: data.candidates[0].output or data.output[0].content[0].text etc.
    if (data.candidates && data.candidates[0]?.content) {
      // older/other shapes
      reply = data.candidates[0].content.map(c => c.text || c).join("");
    } else if (data.output && Array.isArray(data.output)) {
      // some shapes: output -> [{ content: [{ text: "..." }] }]
      try {
        reply = data.output.map(o => {
          if (o.content) return o.content.map(c => c.text || "").join("");
          return "";
        }).join("\n");
      } catch (e) { /* fallthrough */ }
    } else if (data.choices && data.choices[0]?.message?.content) {
      // If using a wrapper that imitates OpenAI shape
      reply = data.choices[0].message.content;
    } else if (data.text) {
      reply = data.text;
    } else {
      // fallback: stringify whole response (but avoid sending huge payload to game)
      reply = JSON.stringify(data).slice(0, 800);
    }

    // Final safety: trim and ensure reply exists
    if (!reply) reply = "Sorry, I couldn't think of a response right now.";

    // Return to Roblox
    return res.json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
