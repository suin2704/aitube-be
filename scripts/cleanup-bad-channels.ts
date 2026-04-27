import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 잘못된 채널 정리: HeyyVance(영어 게임), 백묘(음악), kr29097(무관), Modulab(로봇)
  const badNames = ["HeyyVance", "백묘", "kr29097", "Modulab"];
  for (const name of badNames) {
    const ch = await prisma.channel.findFirst({ where: { name: { contains: name } } });
    if (ch) {
      const vids = await prisma.video.findMany({ where: { channelId: ch.id }, select: { id: true } });
      for (const v of vids) {
        await prisma.videoSummary.deleteMany({ where: { videoId: v.id } });
      }
      await prisma.video.deleteMany({ where: { channelId: ch.id } });
      await prisma.channel.delete({ where: { id: ch.id } });
      console.log(`삭제: ${name} - ${vids.length}개 영상`);
    }
  }

  // AI프렌즈 - 0개 영상이라 채널만 삭제
  const aiFriends = await prisma.channel.findFirst({ where: { name: { contains: "AI프렌즈" } } });
  if (aiFriends) {
    await prisma.channel.delete({ where: { id: aiFriends.id } });
    console.log("삭제: AI프렌즈 (0개 영상)");
  }

  const total = await prisma.video.count();
  const channels = await prisma.channel.count();
  console.log(`\n정리 후: 채널 ${channels}개, 영상 ${total}개`);

  const allCh = await prisma.channel.findMany({
    include: { _count: { select: { videos: true } } },
    orderBy: { id: "asc" },
  });
  for (const c of allCh) {
    console.log(`  ${c.name} — ${c._count.videos}개`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
