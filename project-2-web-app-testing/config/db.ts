
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MongoDB URI is missing");
  }

  await mongoose.connect(uri);

  console.log("MongoDB connected successfully");
};

export default connectDB;
