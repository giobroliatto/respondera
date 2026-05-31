import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function incrementUsage(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { usageCount: { increment: 1 } },
  });
}
