import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 카테고리 3개
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: "ai-trend" },
      update: {},
      create: {
        name: "AI 트렌드",
        slug: "ai-trend",
        icon: "🔥",
        color: "#EF4444",
        sortOrder: 1,
        description: "최신 AI 뉴스와 트렌드",
      },
    }),
    prisma.category.upsert({
      where: { slug: "ai-usage" },
      update: {},
      create: {
        name: "AI 활용",
        slug: "ai-usage",
        icon: "🔧",
        color: "#3B82F6",
        sortOrder: 2,
        description: "AI 도구 활용법과 실전 팁",
      },
    }),
    prisma.category.upsert({
      where: { slug: "ai-learning" },
      update: {},
      create: {
        name: "AI 학습",
        slug: "ai-learning",
        icon: "📚",
        color: "#8B5CF6",
        sortOrder: 3,
        description: "AI/ML 기초부터 심화까지",
      },
    }),
  ]);

  // 샘플 채널들
  const channels = await Promise.all([
    prisma.channel.upsert({
      where: { youtubeId: "UC_tech_inside" },
      update: {},
      create: {
        youtubeId: "UC_tech_inside",
        name: "테크 인사이드",
        description: "최신 기술 트렌드 분석",
        language: "ko",
        defaultCategoryId: categories[0]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_ai_explained" },
      update: {},
      create: {
        youtubeId: "UC_ai_explained",
        name: "AI Explained",
        description: "AI concepts explained simply",
        language: "en",
        defaultCategoryId: categories[0]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_tech_reader" },
      update: {},
      create: {
        youtubeId: "UC_tech_reader",
        name: "테크읽어주는남자",
        description: "테크 뉴스를 쉽게 읽어드립니다",
        language: "ko",
        defaultCategoryId: categories[0]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_ai_decode" },
      update: {},
      create: {
        youtubeId: "UC_ai_decode",
        name: "AI 디코드",
        description: "AI 기술 심층 분석",
        language: "ko",
        defaultCategoryId: categories[0]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_ai_master" },
      update: {},
      create: {
        youtubeId: "UC_ai_master",
        name: "AI 마스터",
        description: "AI 활용 팁과 가이드",
        language: "ko",
        defaultCategoryId: categories[1]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_coding_world" },
      update: {},
      create: {
        youtubeId: "UC_coding_world",
        name: "코딩으로 세상을",
        description: "코딩과 AI 개발 실전",
        language: "ko",
        defaultCategoryId: categories[1]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_creative_ai" },
      update: {},
      create: {
        youtubeId: "UC_creative_ai",
        name: "크리에이티브 AI",
        description: "AI로 창작하는 법",
        language: "ko",
        defaultCategoryId: categories[1]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_biz_ai" },
      update: {},
      create: {
        youtubeId: "UC_biz_ai",
        name: "비즈니스 AI",
        description: "비즈니스에 AI 적용하기",
        language: "ko",
        defaultCategoryId: categories[1]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_ai_campus" },
      update: {},
      create: {
        youtubeId: "UC_ai_campus",
        name: "AI 캠퍼스",
        description: "AI 기초 교육",
        language: "ko",
        defaultCategoryId: categories[2]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_dl_paper" },
      update: {},
      create: {
        youtubeId: "UC_dl_paper",
        name: "딥러닝 논문읽기",
        description: "AI 논문 리뷰 전문",
        language: "ko",
        defaultCategoryId: categories[2]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_ml_eng" },
      update: {},
      create: {
        youtubeId: "UC_ml_eng",
        name: "ML Engineering",
        description: "Machine Learning engineering tutorials",
        language: "en",
        defaultCategoryId: categories[2]!.id,
      },
    }),
    prisma.channel.upsert({
      where: { youtubeId: "UC_enterprise_ai" },
      update: {},
      create: {
        youtubeId: "UC_enterprise_ai",
        name: "엔터프라이즈 AI",
        description: "기업용 AI 솔루션",
        language: "ko",
        defaultCategoryId: categories[2]!.id,
      },
    }),
  ]);

  // 시드 영상 12개
  const videoData = [
    { title: "GPT-5 출시 임박? 2025년 AI 트렌드 전망", catIdx: 0, chIdx: 0, diff: "beginner", lang: "ko", views: 567000, dur: 1125, featured: true },
    { title: "Claude 4 vs GPT-5: The Ultimate Comparison", catIdx: 0, chIdx: 1, diff: "beginner", lang: "en", views: 890000, dur: 1930, featured: false },
    { title: "애플 AI 전략 총정리: 시리가 달라진다", catIdx: 0, chIdx: 2, diff: "beginner", lang: "ko", views: 234000, dur: 1335, featured: false },
    { title: "오픈소스 vs 클로즈드 AI 모델: 누가 이기나?", catIdx: 0, chIdx: 3, diff: "intermediate", lang: "ko", views: 178000, dur: 1530, featured: false },
    { title: "비개발자를 위한 ChatGPT 업무 활용법 10가지", catIdx: 1, chIdx: 4, diff: "beginner", lang: "ko", views: 125000, dur: 930, featured: true },
    { title: "Cursor AI로 풀스택 앱 하루 만에 만들기", catIdx: 1, chIdx: 5, diff: "intermediate", lang: "ko", views: 234000, dur: 3120, featured: true },
    { title: "Midjourney V7 새로운 기능 총정리", catIdx: 1, chIdx: 6, diff: "intermediate", lang: "ko", views: 89000, dur: 1335, featured: false },
    { title: "AI로 쇼핑몰 매출 3배 올리기 - 실전 사례", catIdx: 1, chIdx: 7, diff: "intermediate", lang: "ko", views: 45000, dur: 1680, featured: false },
    { title: "딥러닝 기초: 신경망 이해하기", catIdx: 2, chIdx: 8, diff: "beginner", lang: "ko", views: 312000, dur: 2120, featured: true },
    { title: "Transformer 아키텍처 논문 완벽 리뷰", catIdx: 2, chIdx: 9, diff: "advanced", lang: "ko", views: 445000, dur: 4320, featured: false },
    { title: "LLM Fine-tuning with LoRA: A Complete Tutorial", catIdx: 2, chIdx: 10, diff: "advanced", lang: "en", views: 156000, dur: 2700, featured: false },
    { title: "RAG 파이프라인 실전 구축 가이드", catIdx: 2, chIdx: 11, diff: "advanced", lang: "ko", views: 67000, dur: 3900, featured: false },
  ];

  for (let i = 0; i < videoData.length; i++) {
    const v = videoData[i]!;
    const youtubeId = `seed_video_${String(i + 1).padStart(3, "0")}`;
    await prisma.video.upsert({
      where: { youtubeId },
      update: {},
      create: {
        youtubeId,
        channelId: channels[v.chIdx]!.id,
        categoryId: categories[v.catIdx]!.id,
        title: v.title,
        description: `${v.title}에 대한 상세 설명입니다.`,
        thumbnailUrl: `https://picsum.photos/seed/aitube${i + 1}/480/270`,
        duration: v.dur,
        viewCount: v.views,
        publishedAt: new Date(2026, 3, 26 - i * 2),
        language: v.lang,
        difficulty: v.diff,
        isFeatured: v.featured,
        tags: [],
      },
    });
  }

  console.log("✅ Seed data created successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
