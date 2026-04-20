import { seedQuestion, escalateQuestionToModerator } from "./agent/seeder";

const action = process.argv[2];

async function run() {
  if (action === "seed") {
    console.log("🌱 Manually injecting a dummy question for you to answer...");
    await seedQuestion(process.env.EXPERT_EMAIL ?? "ashifmohd.offl@gmail.com");
    console.log("✅ Done! Go to your Expert dashboard and refresh.");
  } else if (action === "escalate") {
    console.log("🚀 Manually escalating your answer directly to the Moderator Dashboard...");
    await escalateQuestionToModerator();
    console.log("✅ Done! Go to your Moderator dashboard and refresh.");
  } else {
    console.error("Unknown action. Use 'seed' or 'escalate'.");
  }
}

run().catch(console.error);
