import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config({ path: ".env" });

const uri = process.env.DB_URL;
const collections = ["questions", "duplicate_questions"];
//const collections = ["questions"];

// Helper function to capitalize the first letter of each word perfectly
function toTitleCase(str) {
    if (typeof str !== 'string' || !str.trim()) return str;
    return str
        .trim()
        .replace(/\s+/g, ' ') // Reduce multiple spaces to single space
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

async function run() {
    const client = new MongoClient(uri);

    const globalStartTime = performance.now();

    try {
        await client.connect();
        const db = client.db("agriai");

        for (const name of collections) {
            const collectionStartTime = performance.now();
            const collection = db.collection(name);
            console.log(`Normalizing collection: ${name}`);

            // We use a bulk write operation for efficiency
            const bulkOps = [];

            // --- FOR TESTING ---
            // Uncomment the query object below to run this script ONLY on a single specified ID
            // Specify the Question _id of choice 
            //const query = { _id: new ObjectId("69b12fdc74f7741726327718") };

            // --- FOR PRODUCTION ---
            // Use this query object to run the script on ALL documents
            const query = {};

            const cursor = collection.find(query);

            for await (const doc of cursor) {
                if (!doc.details) continue;

                const updatedDetails = {
                    state: toTitleCase(doc.details.state),
                    district: toTitleCase(doc.details.district),
                    crop: toTitleCase(doc.details.crop),
                    season: toTitleCase(doc.details.season),
                    domain: toTitleCase(doc.details.domain)
                };

                bulkOps.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: { details: { ...doc.details, ...updatedDetails } } }
                    }
                });

                // Execute in batches of 1000 so we don't run out of RAM
                if (bulkOps.length >= 1000) {
                    await collection.bulkWrite(bulkOps);
                    bulkOps.length = 0;
                }
            }

            // Execute any remaining operations
            if (bulkOps.length > 0) {
                await collection.bulkWrite(bulkOps);
            }

            const collectionEndTime = performance.now();
            console.log(`${name} updated successfully in ${((collectionEndTime - collectionStartTime) / 1000).toFixed(2)}s.`);
        }

        const globalEndTime = performance.now();
        console.log(`Normalization complete in ${((globalEndTime - globalStartTime) / 1000).toFixed(2)}s.`);
    } catch (err) {
        console.error("Error during normalization:", err);
    } finally {
        await client.close();
    }
}

run();
