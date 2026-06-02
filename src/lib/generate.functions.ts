import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  frontend: z.string(),
  backend: z.string(),
  database: z.string(),
  auth: z.boolean(),
  extras: z.array(z.string()),
});

export type GeneratedProject = {
  files: { path: string; content: string }[];
  setup_steps: string[];
  summary: string;
};

export const generateProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<GeneratedProject> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY missing — set it in your .env");

    const prompt = `You are an expert full-stack scaffolder. Generate a working starter project.

Project name: ${data.name}
Description: ${data.description}
Frontend: ${data.frontend}
Backend: ${data.backend}
Database: ${data.database}
Authentication: ${data.auth ? "Yes" : "No"}
Extras: ${data.extras.join(", ") || "none"}

Respond ONLY with valid JSON matching exactly this shape (no markdown fences, no extra text):
{
  "files": [{ "path": "relative/path.ext", "content": "full file contents as string" }],
  "setup_steps": ["command 1", "command 2"],
  "summary": "Brief description"
}

Generate 6-15 real, runnable files. Include package.json / requirements.txt as relevant.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 8192,
        messages: [
          {
            role: "system",
            content:
              "You are an expert full-stack scaffolder. Always respond with only valid JSON — no markdown, no explanation, no code fences.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";

    let parsed: GeneratedProject;
    try {
      // Strip any accidental markdown fences
      const clean = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Model returned non-JSON output");
      parsed = JSON.parse(m[0]);
    }

    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error("Invalid response shape from model");
    }

    return parsed;
  });
