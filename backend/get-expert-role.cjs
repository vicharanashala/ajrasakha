const { MongoClient, ObjectId } = require('mongodb');

const uri = "mongodb://hamvar06_db_user:hamsa0606@ac-rhwckan-shard-00-00.7sywy83.mongodb.net:27017,ac-rhwckan-shard-00-01.7sywy83.mongodb.net:27017,ac-rhwckan-shard-00-02.7sywy83.mongodb.net:27017/?ssl=true&replicaSet=atlas-nu7u47-shard-0&authSource=admin&appName=Cluster0";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("agriai");
    const user = await db.collection("users").findOne({ _id: new ObjectId("6a93012146eccf221f2e7e89") });
    console.log("User Role:", user.role);
  } finally {
    await client.close();
  }
}
run();
