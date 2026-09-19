import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const bookings = await prisma.booking.findMany();
  console.log('Total Bookings:', bookings.length);

  const latest = await prisma.booking.findMany({orderBy: {createdAt: 'desc'}, take: 1});
  console.log('Latest booking:', latest);
}

run()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
