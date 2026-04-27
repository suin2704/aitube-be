import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

interface SummaryResult {
  summary: string;
  keyPoints: string[];
  keywords: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  aiCategory: string;
  estimatedTime: number;
}

/**
 * 영상 제목 + 설명 + 자막(있는 경우)을 기반으로 AI 요약 생성
 */
export async function generateSummary(
  title: string,
  description: string,
  transcript?: string,
): Promise<SummaryResult> {
  const textContent = transcript
    ? `제목: ${title}\n\n설명: ${description}\n\n자막:\n${transcript.slice(0, 15000)}`
    : `제목: ${title}\n\n설명: ${description}`;

  const prompt = `당신은 AI/기술 교육 콘텐츠 분석 전문가입니다. 아래 유튜브 영상 정보를 분석하여 JSON 형식으로 요약해주세요.

${textContent}

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "summary": "3~5문장으로 된 영상 핵심 요약 (한국어)",
  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "difficulty": "beginner 또는 intermediate 또는 advanced",
  "aiCategory": "ai-trend 또는 ai-usage 또는 ai-learning",
  "estimatedTime": 예상학습시간(분, 숫자만)
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });

  const text = response.text?.trim() || "";

  // JSON 파싱 (```json ... ``` 감싸진 경우 처리)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI 응답에서 JSON을 찾을 수 없습니다");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    summary: parsed.summary || "요약을 생성할 수 없습니다.",
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [],
    difficulty: ["beginner", "intermediate", "advanced"].includes(parsed.difficulty)
      ? parsed.difficulty
      : "beginner",
    aiCategory: ["ai-trend", "ai-usage", "ai-learning"].includes(parsed.aiCategory)
      ? parsed.aiCategory
      : "ai-trend",
    estimatedTime: typeof parsed.estimatedTime === "number" ? parsed.estimatedTime : 10,
  };
}
