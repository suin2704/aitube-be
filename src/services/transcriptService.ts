/**
 * YouTube 자막(transcript) 추출 서비스
 * 1차: youtube-transcript 패키지
 * 2차: 영상 설명(description) 폴백
 */

interface TranscriptResult {
  text: string;
  source: "transcript" | "description" | "none";
}

export async function getTranscript(videoId: string, description?: string): Promise<TranscriptResult> {
  // 1차: youtube-transcript 패키지 시도
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ko" });
    if (items && items.length > 0) {
      const text = items.map((item: { text: string }) => item.text).join(" ");
      if (text.length > 50) {
        return { text, source: "transcript" };
      }
    }
  } catch {
    // 한국어 자막 실패 시 영어 시도
    try {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
      if (items && items.length > 0) {
        const text = items.map((item: { text: string }) => item.text).join(" ");
        if (text.length > 50) {
          return { text, source: "transcript" };
        }
      }
    } catch {
      // 자막 추출 실패
    }
  }

  // 2차: 설명(description) 폴백
  if (description && description.length > 100) {
    return { text: description, source: "description" };
  }

  // 3차: 불가
  return { text: "", source: "none" };
}
