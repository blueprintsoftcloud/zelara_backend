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
    console.log(`User with email ${email} not found in database.`);
    process.exit(0);
  }

  console.log(`Found user: ${user.username} (${user.email}) with ID: ${user._id}`);

  // Delete StaffProfile
  const profileDeleted = await StaffProfile.findOneAndDelete({ userId: user._id });
  if (profileDeleted) {
    console.log(`Deleted StaffProfile for user ID ${user._id}`);
  } else {
    console.log(`No StaffProfile found for user ID ${user._id}`);
  }

  // Delete User
  await User.findByIdAndDelete(user._id);
  console.log(`Deleted User document for ${email}`);

  console.log("Cleanup complete!");
  process.exit(0);
}

run().catch(console.error);
