import * as dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is missing");
    process.exit(1);
  }
  await mongoose.connect(url);
  console.log("Connected to Mongo");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("DB connection failed");
    process.exit(1);
  }

  const allUsers = await db.collection("users").find().toArray();
  console.log("All users in DB:");
  allUsers.forEach(u => {
    console.log(`- ID: ${u._id}, Username: ${u.username}, Email: ${u.email}, Phone: ${u.phone}, Role: ${u.role}`);
  });

  const profiles = await db.collection("staffprofiles").find().toArray();
  console.log("Staff Profiles:");
  profiles.forEach(p => {
    console.log(`- Profile ID: ${p._id}, User ID: ${p.userId}, Managed By Admin ID: ${p.managedBy}`);
  });

  process.exit(0);
}
run().catch(console.error);
