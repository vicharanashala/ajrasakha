import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const DB_URL = process.env.DB_URL || 'mongodb+srv://tomarkavya74:tomer2005@cluster0.stwmabt.mongodb.net/agriai?retryWrites=true&w=majority';
const DB_NAME = process.env.DB_NAME || 'agriai';

async function seed() {
  console.log(`Connecting to MongoDB at ${DB_URL.replace(/:([^:@]+)@/, ':****@')} ...`);
  const client = new MongoClient(DB_URL, {
    family: 4,
    tls: true,
    tlsAllowInvalidCertificates: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });


  try {
    await client.connect();
    console.log('Connected to MongoDB successfully.');
    const db = client.db(DB_NAME);

    const questionsCol = db.collection('questions');
    const feedbackCol = db.collection('farmer_feedbacks');

    // 1. Fetch some real questions from DB
    let questions = await questionsCol.find({}).limit(30).toArray();

    if (questions.length === 0) {
      console.log('No questions found in questions collection. Creating sample GDB questions first...');
      const sampleQuestions = [
        {
          question: "गेहूं में पीला रतुआ (Yellow Rust) की रोकथाम के लिए कौन सी दवा स्प्रे करें?",
          details: { crop: "Wheat", domain: ["Pest & Disease"], state: "Punjab", district: "Ludhiana" },
          aiApprovedAnswer: "प्रोपीकोनाज़ोल (Propiconazole 25% EC) @ 1 मिली/लीटर पानी में घोलकर तुरंत छिड़काव करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "धान की फसल में तना छेदक (Stem Borer) के नियंत्रण का उपाय बताएं?",
          details: { crop: "Rice", domain: ["Pest & Disease"], state: "Haryana", district: "Karnal" },
          aiApprovedAnswer: "कार्बोफ्यूरान 3G @ 10 किग्रा प्रति एकड़ या क्लोरेंट्रानिलिप्रोल 0.4% GR का प्रयोग करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "कपास में गुलाबी सुंडी (Pink Bollworm) के हमले से कैसे बचाएं?",
          details: { crop: "Cotton", domain: ["Pest & Disease"], state: "Maharashtra", district: "Yavatmal" },
          aiApprovedAnswer: "फेरोमोन ट्रैप लगाएं (5-8 प्रति एकड़) और 10% डैमेज पर एमामेक्टिन बेंजोएट 5% SG @ 4 ग्राम प्रति 10 लीटर पानी स्प्रे करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "टमाटर में फल छेदक कीट और पत्ती मरोड़ बीमारी का उपचार क्या है?",
          details: { crop: "Tomato", domain: ["Nutrient & Fertilizer"], state: "Uttar Pradesh", district: "Varanasi" },
          aiApprovedAnswer: "नीम का तेल 5ml/लीटर + इमिडाक्लोप्रिड 17.8% SL @ 0.5ml/लीटर का स्प्रे करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "सरसों में माहू (Aphids) कीट के प्रकोप को कैसे रोकें?",
          details: { crop: "Mustard", domain: ["Pest & Disease"], state: "Rajasthan", district: "Alwar" },
          aiApprovedAnswer: "डाइमेथोएट 30% EC @ 1.5 मिली प्रति लीटर पानी में मिलाकर स्प्रे करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "गन्ने में लाल सड़न (Red Rot) रोग से बचाव के क्या उपाय हैं?",
          details: { crop: "Sugarcane", domain: ["Pest & Disease"], state: "Uttar Pradesh", district: "Meerut" },
          aiApprovedAnswer: "रोगमुक्त बीजों का चयन करें, बाविस्टिन 0.1% के घोल में बीजोपचार करें और ट्राइकोडर्मा विरिडी का प्रयोग करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "पीएम किसान सम्मान निधि योजना की 18वीं किस्त की स्थिति कैसे चेक करें?",
          details: { crop: "Wheat", domain: ["Government Schemes"], state: "Madhya Pradesh", district: "Indore" },
          aiApprovedAnswer: "pmkisan.gov.in पर जाकर 'Know Your Status' पर क्लिक करें और अपना रजिस्ट्रेशन नंबर व कैप्चा दर्ज करें।",
          status: "closed",
          createdAt: new Date(),
        },
        {
          question: "आलू की फसल में पछेता झुलसा (Late Blight) रोग के लक्षण और उपाय क्या हैं?",
          details: { crop: "Potato", domain: ["Pest & Disease"], state: "West Bengal", district: "Hooghly" },
          aiApprovedAnswer: "मैंकोज़ेब 75% WP @ 2 ग्राम/लीटर पानी या मेटालैक्सिल 8% + मैंकोज़ेब 64% WP @ 1.5 ग्राम/लीटर का स्प्रे करें।",
          status: "closed",
          createdAt: new Date(),
        },
      ];

      const inserted = await questionsCol.insertMany(sampleQuestions);
      console.log(`Inserted ${inserted.insertedCount} sample questions.`);
      questions = await questionsCol.find({}).toArray();
    }

    console.log(`Using ${questions.length} questions to generate realistic WhatsApp feedback...`);

    // Clean previous seed feedback if any
    await feedbackCol.deleteMany({});
    console.log('Cleared existing farmer_feedbacks collection.');

    const languages = ['hi', 'hi', 'hi', 'pa', 'mr', 'te', 'bn', 'en'];
    const feedbackEntries = [];

    // Helper random date in last 30 days
    function randomPastDate(daysAgo = 30) {
      const now = new Date();
      return new Date(now.getTime() - Math.floor(Math.random() * daysAgo * 24 * 60 * 60 * 1000));
    }

    // Generate feedback for each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qId = q._id;
      const crop = q.details?.crop || 'Wheat';
      const domain = Array.isArray(q.details?.domain) ? q.details.domain[0] : (q.details?.domain || 'Pest & Disease');
      const state = q.details?.state || 'Punjab';
      const qText = q.question || 'Agricultural query';
      const answer = q.aiApprovedAnswer || q.answer || 'Standard advisory response';

      // Decide if this question is high quality (80-95% positive) or underperforming (<60% positive)
      const isLowQuality = (i % 3 === 0); // Every 3rd question has low satisfaction for reviewer testing
      const totalRatings = Math.floor(Math.random() * 15) + 12; // 12 to 26 responses

      for (let r = 0; r < totalRatings; r++) {
        let isHelpful = false;
        if (isLowQuality) {
          // Low rating: 30-45% helpful
          isHelpful = Math.random() < 0.38;
        } else {
          // High rating: 80-92% helpful
          isHelpful = Math.random() < 0.86;
        }

        const rating = isHelpful ? 1 : 2;
        const lang = languages[Math.floor(Math.random() * languages.length)];
        const phone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

        let feedbackText = undefined;
        if (!isHelpful) {
          const negativeComments = [
            "दवा की सही मात्रा स्पष्ट नहीं थी।",
            "Spray dosage was not clear for 1 acre.",
            "मात्रा कम बताई गई है।",
            "दुकानदार ने कहा यह दवा इस रोग की नहीं है।",
            "Not relevant to my region weather.",
            "Water ratio not mentioned clearly."
          ];
          feedbackText = negativeComments[Math.floor(Math.random() * negativeComments.length)];
        }

        feedbackEntries.push({
          questionId: qId,
          phoneNumber: phone,
          queryText: qText,
          deliveredAnswer: answer,
          domain,
          crop,
          state,
          language: lang,
          rating,
          isHelpful,
          feedbackText,
          source: 'WHATSAPP',
          flaggedForReview: false,
          createdAt: randomPastDate(20),
          updatedAt: new Date(),
        });
      }
    }

    const res = await feedbackCol.insertMany(feedbackEntries);
    console.log(`Successfully inserted ${res.insertedCount} farmer feedback records into MongoDB!`);

    // Create index on questionId, createdAt, domain, state, language
    await feedbackCol.createIndex({ questionId: 1 });
    await feedbackCol.createIndex({ createdAt: -1 });
    await feedbackCol.createIndex({ domain: 1 });
    await feedbackCol.createIndex({ state: 1 });
    await feedbackCol.createIndex({ isHelpful: 1 });
    console.log('MongoDB indexes created successfully.');

  } catch (err) {
    console.error('Error seeding farmer feedback:', err);
  } finally {
    await client.close();
    console.log('Database connection closed.');
  }
}

seed();
