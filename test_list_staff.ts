import * as dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { prisma as prismaImport } from "./src/config/prisma";

const prisma = prismaImport as any;

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is missing");
    process.exit(1);
  }
  await mongoose.connect(url);
  console.log("Connected to Mongo");

  const managedBy = "69f1876ec3f58ddfc5bd0454"; // Super Admin ID

  // Fetch profiles first
  const profiles = await prisma.staffProfile.findMany({
    where: { managedBy },
    orderBy: { createdAt: "desc" },
  });

  console.log("Profiles found:", JSON.stringify(profiles, null, 2));

  if (profiles.length === 0) {
    console.log("No profiles found for managedBy:", managedBy);
    process.exit(0);
  }

  const userIds = profiles.map((p: any) => p.userId).filter(Boolean);
  console.log("User IDs extracted:", userIds);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, email: true, phone: true, createdAt: true, avatar: true },
  });

  console.log("Users found from userIds:", JSON.stringify(users, null, 2));

  const userMap: Record<string, any> = {};
  users.forEach((u: any) => { userMap[u.id] = u; });

  const result = profiles
    .filter((p: any) => userMap[p.userId] != null)
    .map((p: any) => ({
      id: p.id,
      isActive: p.isActive,
      permissions: p.permissions ?? [],
      notes: p.notes ?? null,
      createdAt: p.createdAt,
      user: userMap[p.userId],
    }));

  console.log("Final result from listStaff logic:", JSON.stringify(result, null, 2));

  const orphanIds = profiles
    .filter((p: any) => userMap[p.userId] == null)
    .map((p: any) => p.id);

  console.log("Orphan IDs identified:", orphanIds);

  process.exit(0);
}

run().catch(console.error);
