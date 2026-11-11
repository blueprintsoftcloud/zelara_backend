import * as dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { User, StaffProfile } from "./src/models/mongoose";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is missing");
    process.exit(1);
  }
  await mongoose.connect(url);
  console.log("Connected to Mongo");

  const email = "arunkuttan3636@gmail.com";
  const user = await User.findOne({ email });

  if (!user) {
    console.log(`User ${email} not found.`);
    process.exit(0);
  }

  const profile = await StaffProfile.findOne({ userId: user._id });
  if (!profile) {
    console.log(`No StaffProfile found for user ${email}`);
  } else {
    console.log("Staff Profile found:");
    console.log(`- ID: ${profile._id}`);
    console.log(`- userId: ${profile.userId}`);
    console.log(`- managedBy: ${profile.managedBy}`);
    console.log(`- permissions:`, profile.permissions);
    console.log(`- isActive: ${profile.isActive}`);
  }

  process.exit(0);
}
run().catch(console.error);
