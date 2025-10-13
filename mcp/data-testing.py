from pymongo import MongoClient
from constants import MONGODB_URI  # Make sure this contains your Mongo URI

# Connect to MongoDB
client = MongoClient(MONGODB_URI)

# Select the database and collection
db = client["golden_db"]
collection = db["agri_qa"]

# Fetch distinct states from metadata.State
unique_states = collection.distinct("metadata.State")

# Print results
print(f"Total unique states: {len(unique_states)}")
print("List of states:")
for state in sorted(unique_states):
    print("-", state)
