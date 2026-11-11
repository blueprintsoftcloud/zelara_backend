// src/utils/notificationRecipients.ts
// Shared recipient-resolution helpers for fan-out notifications.
// Extracted from order.controller.ts so background workers (e.g. the low-stock
// inventory check) can resolve recipients without importing from a controller.

import { Role, User } from "../models/mongoose";

/** Returns all SUPER_ADMIN user IDs — platform operators, not tenant admins. */
export const getSuperAdminRecipients = async (): Promise<string[]> => {
  const users = await User.find({ role: Role.SUPER_ADMIN }).select("_id").lean();
  return users.map((u) => u._id.toString());
};

/** Returns all ADMIN + SUPER_ADMIN user IDs. */
export const getAdminRecipients = async (): Promise<string[]> => {
  const users = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });
  return users.map((u: any) => u.id);
};

/** Returns ADMIN + SUPER_ADMIN IDs plus active STAFF with the given permission. */
export const getAdminAndStaffRecipients = async (staffPermission: string): Promise<string[]> => {
  const [admins, staff] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
      select: { id: true },
    }),
    prisma.staffProfile.findMany({
      where: { permissions: { has: staffPermission }, isActive: true },
      select: { userId: true },
    }),
  ]);
  const all = [...admins.map((u: any) => u.id), ...staff.map((s: any) => s.userId)];
  return Array.from(new Set(all.filter(Boolean)));
};
