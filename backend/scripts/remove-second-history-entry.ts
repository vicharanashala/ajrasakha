import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.DB_URI!;
const DB_NAME = process.env.DB_NAME;

const DOCUMENT_ID = '6a5d9b227772a6175de20377';

async function run() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);

    const result = await db.collection('question_submissions').updateOne(
      {
        _id: new ObjectId(DOCUMENT_ID),
      },
      [
        {
          $set: {
            history: {
              $concatArrays: [
                { $slice: ['$history', 1] },
                {
                  $slice: [
                    '$history',
                    2,
                    {
                      $subtract: [
                        { $size: '$history' },
                        2,
                      ],
                    },
                  ],
                },
              ],
            },
            queue: {
              $concatArrays: [
                { $slice: ['$queue', 1] },
                {
                  $slice: [
                    '$queue',
                    2,
                    {
                      $subtract: [
                        { $size: '$queue' },
                        2,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ]
    );

    console.log(result);
    console.log('✅ Migration completed');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();