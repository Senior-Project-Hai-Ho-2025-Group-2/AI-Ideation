import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Sanity check for the key
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY in server/.env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fast/cheap JSON-capable model
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Helper: try to parse JSON, even if wrapped in ```json ... ```
function safeParseJSON(text) {
  if (!text) throw new Error("Empty model response");

  // Strip code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = fenced ? fenced[1] : text;

  // Find the first JSON object/array if extra text surrounds it
  const start = payload.indexOf("{");
  const startArr = payload.indexOf("[");
  const s = (start === -1) ? startArr : (startArr === -1 ? start : Math.min(start, startArr));
  if (s === -1) throw new Error("No JSON object/array detected in response");

  // Try to locate matching bracket
  // Simple attempt: parse whole payload from first bracket
  const candidate = payload.slice(s).trim();

  return JSON.parse(candidate);
}

app.post("/api/generate", async (req, res) => {
  try {
    const {
      problem = "",
      tags = [],
      innovation = "Balanced",
      budget = "",
      complexity = "",
      n = 3
    } = req.body || {};

    // Strong instructions: JSON only
    const prompt = `
You are an AI product strategist.
Return ONLY strict JSON (no prose, no markdown). Schema:
{
  "ideas": [
    {
      "title": "",
      "summary": "",
      "constraints_fit": { "budget": "", "complexity": "", "tech_stack": [] },
      "market_snapshot": {
        "target_user": "",
        "jtbd": "",
        "competitors": [],
        "differentiators": [],
        "assumptions": []
      },
      "scores": {
        "novelty": 0,
        "feasibility": 0,
        "cost_risk": 0,
        "time_to_mvp_weeks": 0,
        "weighted_total": 0
      },
      "next_steps": [],
      "sources_or_notes": []
    }
  ]
}

Constraints:
- Problem: ${problem}
- Tech: ${Array.isArray(tags) ? tags.join(", ") : tags}
- Innovation: ${innovation}
- Budget: ${budget}
- Complexity: ${complexity}
Generate ${n} distinct ideas that satisfy these constraints.

Only output JSON conforming to the schema above.
`;

    const result = await model.generateContent(prompt);
    const raw = result?.response?.text?.() ?? "";
    // Log raw once during debug
    // console.log("RAW MODEL TEXT >>>", raw);

    const data = safeParseJSON(raw);

    // Minimal validation
    if (!data || !Array.isArray(data.ideas)) {
      throw new Error("Model did not return { ideas: [...] }");
    }

    res.json(data);
  } catch (err) {
    console.error("❌ /api/generate error:", err);
    res.status(500).json({
      error: "Generation failed",
      hint: "Check server logs for details. Common causes: missing GEMINI_API_KEY, invalid model, or non-JSON model output."
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
