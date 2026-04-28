import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import cron from "node-cron";
import { runCrawl } from "./services/crawlService";
import { runAutoSummary } from "./services/autoSummaryService";
import { runViewCountUpdate } from "./services/viewCountService";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 AI Tube API server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}/api/v1/health`);

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

    // AI 요약 자동 생성: 크롤링 1시간 후 (1 1,7,13,19 * * *)
    cron.schedule("0 1,7,13,19 * * *", async () => {
      console.log("🤖 [CRON] AI 요약 자동 생성 시작...");
      try {
        const result = await runAutoSummary();
        console.log(
          `🤖 [CRON] 완료: ${result.success}/${result.processed}개 성공`
        );
        if (result.errors.length) {
          console.warn("🤖 [CRON] 오류:", result.errors);
        }
      } catch (err) {
        console.error("🤖 [CRON] AI 요약 실패:", err);
      }
    });
    console.log("🤖 AI 요약 자동생성 스케줄 등록 (크롤링 1시간 후)");

    // 조회수 업데이트: 매일 06:00 (0 6 * * *)
    cron.schedule("0 6 * * *", async () => {
      console.log("📊 [CRON] 조회수 업데이트 시작...");
      try {
        const result = await runViewCountUpdate();
        console.log(`📊 [CRON] 완료: ${result.updated}개 업데이트`);
        if (result.errors.length) {
          console.warn("📊 [CRON] 오류:", result.errors);
        }
      } catch (err) {
        console.error("📊 [CRON] 조회수 업데이트 실패:", err);
      }
    });
    console.log("📊 조회수 업데이트 스케줄 등록 (매일 06:00)");
  }
});
