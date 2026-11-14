
import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "./config/db";
import { Question, Answer } from "./models/model";

dotenv.config();

const mockData = [
  {
    language: "Hindi",
    question: "गेहूं की फसल में पीले पत्ते क्यों होते हैं?",
    answer: "गेहूं में पीले पत्ते नाइट्रोजन की कमी, पानी की अधिकता या रोग के कारण हो सकते हैं। मिट्टी की जांच करवाएं।",
  },
  {
    language: "Marathi",
    question: "कापूस पिकाला पाणी किती वेळा द्यावे?",
    answer: "कापूस पिकाला जमिनीचा प्रकार आणि हवामानानुसार पाणी द्यावे. जमिनीत योग्य ओलावा ठेवा.",
  },
  {
    language: "Bengali",
    question: "ধান গাছে পাতা হলুদ হয়ে যায় কেন?",
    answer: "ধান গাছের পাতা হলুদ হতে পারে নাইট্রোজেনের অভাব, অতিরিক্ত জল বা রোগের কারণে।",
  },
  {
    language: "Tamil",
    question: "நெல் பயிரில் பூச்சிகளை எவ்வாறு கட்டுப்படுத்துவது?",
    answer: "நெல் பயிரில் பூச்சிகளைக் கட்டுப்படுத்த வயலைத் தொடர்ந்து கண்காணித்து, வேளாண் நிபுணரின் ஆலோசனையைப் பெறுங்கள்.",
  },
  {
    language: "Telugu",
    question: "పత్తి పంటకు నీరు ఎప్పుడు పెట్టాలి?",
    answer: "నేల తేమ మరియు వాతావరణ పరిస్థితులను బట్టి పత్తి పంటకు నీరు పెట్టాలి.",
  },
];

const seedDatabase = async () => {
  try {
    await connectDB();

    for (const item of mockData) {
      const question = await Question.findOneAndUpdate(
        {
          question: item.question,
          language: item.language,
        },
        {
          $setOnInsert: {
            question: item.question,
            language: item.language,
          },
        },
        {
          upsert: true,
          new: true,
        }
      );

      await Answer.findOneAndUpdate(
        { questionId: question._id },
        {
          $set: {
            answer: item.answer,
            language: item.language,
            disclaimerShown: false,
          },
        },
        {
          upsert: true,
          new: true,
        }
      );

      console.log(`Seeded: ${item.language}`);
    }

    console.log("Mock data inserted successfully.");
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seedDatabase();
