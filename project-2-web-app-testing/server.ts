
import express from "express";
import connectDB from "./config/db";
import {
  createQuestion,
  createAnswer,
  fetchAnswer,
} from "./controllers/questionController";

const app = express();
const PORT = 3001;

app.use(express.json());

app.post("/api/questions", createQuestion);
app.post("/api/answers", createAnswer);
app.get("/api/answers/:questionId", fetchAnswer);

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
