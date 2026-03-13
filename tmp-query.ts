import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const latestTranscript = await prisma.transcript.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  console.log("=== LATEST TRANSCRIPT ===");
  console.log(latestTranscript?.text);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
