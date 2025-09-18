import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Your Gemini API key will come from Render secrets
const GEMINI_KEY = process.env.GEMINI_KEY;

// Endpoint for Roblox -> Gemini
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "Hello!";

    // Call Gemini API (text-only, streaming disabled)
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    // Extract the reply text (Gemini returns in candidates → content → parts)
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn’t generate a response.";

    res.json({ reply });
  } catch (err) {
    console.error("Error contacting Gemini:", err);
    res.status(500).json({ reply: "Error contacting Gemini service." });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gemini proxy running on port ${PORT}`));
