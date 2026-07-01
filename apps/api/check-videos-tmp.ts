import { prisma } from "@clipflow/db";

async function main() {
  const rows = await prisma.video.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      chaptersJson: true,
      transcriptS3Key: true,
      scheduledPublishAt: true,
      failureReason: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  for (const r of rows) {
    const chapters = r.chaptersJson as null | { summary?: string; chapters?: unknown[] };
    console.log(
      JSON.stringify(
        {
          id: r.id,
          status: r.status,
          chaptersIsSet: !!r.chaptersJson,
          chaptersTopKeys: chapters ? Object.keys(chapters) : [],
          chapterCount: chapters && Array.isArray(chapters.chapters) ? chapters.chapters.length : 0,
          summaryLen: chapters && typeof chapters.summary === "string" ? chapters.summary.length : 0,
          transcriptKey: r.transcriptS3Key,
          schedAt: r.scheduledPublishAt,
          failReason: r.failureReason,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
        },
        null,
        2,
      ),
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
