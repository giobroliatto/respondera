import { prisma } from '../lib/prisma';

export async function incrementUsage(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { usageCount: { increment: 1 } },
  });
}
