import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import cron from "node-cron";
import { runCrawl } from "./services/crawlService";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 AI Tube API server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}/api/v1/health`);
  console.log(`🔑 ENV check: ADMIN_PASSWORD=${!!process.env.ADMIN_PASSWORD}, JWT_SECRET=${!!process.env.JWT_SECRET}, YOUTUBE_API_KEY=${!!process.env.YOUTUBE_API_KEY}, GEMINI_API_KEY=${!!process.env.GEMINI_API_KEY}, DATABASE_URL=${!!process.env.DATABASE_URL}`);

  // 자동 크롤링: 6시간마다 (0 */6 * * *)
  if (process.env.ENABLE_CRON !== "false") {
    cron.schedule("0 */6 * * *", async () => {
      console.log("⏰ [CRON] 자동 크롤링 시작...");
      try {
        const result = await runCrawl();
        console.log(
          `⏰ [CRON] 완료: ${result.channelsProcessed}개 채널, ${result.newVideos}개 새 영상`
        );
        if (result.errors.length) {
          console.warn("⏰ [CRON] 오류:", result.errors);
        }
      } catch (err) {
        console.error("⏰ [CRON] 크롤링 실패:", err);
      }
    });
    console.log("⏰ 자동 크롤링 스케줄 등록 (6시간마다)");
  }
});
