"""
CSV-based FAQ Data Ingestion Script

This script loads FAQ data from CSV file, generates embeddings for queries,
and stores them in MongoDB for semantic search.

Usage:
    python ingest_csv_faq.py

CSV Fields Used:
    - Title
    - Link
    - Refined KCC Query [HF]
    - English Answer
    
Skips rows with empty Title or Link.

Author: Ajrasakha Team
Date: November 2, 2025
"""

import os
import sys
import csv
from typing import List, Dict, Any
from datetime import datetime

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from pymongo import MongoClient

# Load environment variables
load_dotenv()

# Configuration
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb+srv://agriai:agriai1224@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging")
DATABASE_NAME = os.getenv("FAQ_DATABASE_NAME", "golden_db")
COLLECTION_NAME = os.getenv("FAQ_COLLECTION_NAME", "faq")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-en")

# CSV file path
CSV_FILE = "data/FAQ Question Sheet  - Sheet1.csv"


class CSVFAQIngestion:
    """Handle CSV FAQ data ingestion to MongoDB."""
    
    def __init__(self):
        """Initialize the ingestion system."""
        self.db_client = None
        self.db_collection = None
        self.embedding_model = None
        
        self._initialize_mongodb()
        self._initialize_embeddings()
    
    def _initialize_mongodb(self):
        """Initialize MongoDB connection."""
        try:
            self.db_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            self.db_client.server_info()
            
            db = self.db_client[DATABASE_NAME]
            self.db_collection = db[COLLECTION_NAME]
            
            # Create indexes for efficient querying
            self.db_collection.create_index("title")
            self.db_collection.create_index("link")
            
            print(f"✓ Connected to MongoDB: {DATABASE_NAME}.{COLLECTION_NAME}")
        except Exception as e:
            print(f"✗ Failed to connect to MongoDB: {e}")
            sys.exit(1)
    
    def _initialize_embeddings(self):
        """Initialize embedding model."""
        try:
            print(f"⏳ Loading embedding model: {EMBEDDING_MODEL}...")
            self.embedding_model = SentenceTransformer(EMBEDDING_MODEL)
            print(f"✓ Embedding model loaded: {EMBEDDING_MODEL}")
        except Exception as e:
            print(f"✗ Failed to load embedding model: {e}")
            sys.exit(1)
    
    def load_csv_data(self, csv_file: str) -> List[Dict[str, str]]:
        """
        Load and parse CSV file.
        
        Args:
            csv_file: Path to CSV file
            
        Returns:
            List of dictionaries with FAQ data
        """
        faq_data = []
        
        try:
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                for idx, row in enumerate(reader, 1):
                    # Extract fields
                    title = row.get('Title', '').strip()
                    link = row.get('Link', '').strip()
                    query = row.get('Refined KCC Query [HF]', '').strip()
                    english_answer = row.get(' English Answer', '').strip()  # Note the leading space
                    
                    # Skip rows with empty Title or Link
                    if not title or not link:
                        continue
                    
                    # Skip if query is empty (nothing to embed)
                    if not query:
                        continue
                    
                    faq_data.append({
                        'title': title,
                        'link': link,
                        'query': query,
                        'english_answer': english_answer
                    })
            
            print(f"✓ Loaded {len(faq_data)} valid FAQ entries from CSV")
            return faq_data
            
        except FileNotFoundError:
            print(f"✗ CSV file not found: {csv_file}")
            sys.exit(1)
        except Exception as e:
            print(f"✗ Error reading CSV file: {e}")
            sys.exit(1)
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector as list of floats
        """
        embedding = self.embedding_model.encode(text)
        return embedding.tolist()
    
    def store_faq_entry(self, faq_entry: Dict[str, str]) -> bool:
        """
        Process and store a single FAQ entry in MongoDB.
        
        Args:
            faq_entry: Dictionary with title, link, query, english_answer
            
        Returns:
            True if stored successfully, False otherwise
        """
        try:
            # Check if entry already exists (by link)
            existing = self.db_collection.find_one({"link": faq_entry['link']})
            if existing:
                print(f"⚠️  Entry already exists: {faq_entry['link']}")z
                return False  # Already exists
            
            # Generate embedding for the query
            embedding = self.generate_embedding(faq_entry['query'])
            
            # Create document
            doc = {
                "title": faq_entry['title'],
                "link": faq_entry['link'],
                "query": faq_entry['query'],
                "english_answer": faq_entry['english_answer'],
                "embedding": embedding,
                "created_at": datetime.utcnow()
            }
            
            # Insert into MongoDB
            self.db_collection.insert_one(doc)
            return True
            
        except Exception as e:
            print(f"  ✗ Error storing entry: {e}")
            return False
    
    def clear_collection(self):
        """Clear all documents from the collection."""
        try:
            result = self.db_collection.delete_many({})
            print(f"✓ Cleared {result.deleted_count} existing documents")
        except Exception as e:
            print(f"✗ Error clearing collection: {e}")
    
    def process_csv(self, csv_file: str, clear_first: bool = False):
        """
        Process entire CSV file and store in MongoDB.
        
        Args:
            csv_file: Path to CSV file
            clear_first: Whether to clear existing data first
        """
        print("=" * 70)
        print("CSV-based FAQ Data Ingestion")
        print("=" * 70)
        print(f"\n📄 CSV File: {csv_file}")
        print(f"💾 Database: {DATABASE_NAME}.{COLLECTION_NAME}")
        print(f"🤖 Embedding Model: {EMBEDDING_MODEL}\n")
        
        # Clear existing data if requested
        if clear_first:
            print("🗑️  Clearing existing data...")
            self.clear_collection()
            print()
        
        # Load CSV data
        print("📋 Loading CSV data...")
        faq_data = self.load_csv_data(csv_file)
        
        if not faq_data:
            print("\n⚠️  No valid FAQ entries found. Exiting.")
            return
        
        print(f"✓ Found {len(faq_data)} entries to process\n")
        
        # Process each entry
        stored_count = 0
        skipped_count = 0
        error_count = 0
        
        for idx, entry in enumerate(faq_data, 1):
            print(f"[{idx}/{len(faq_data)}] Processing: {entry['title'][:60]}...")
            
            success = self.store_faq_entry(entry)
            
            if success:
                stored_count += 1
                print(f"  ✓ Stored successfully")
            else:
                skipped_count += 1
                print(f"  ⚠️  Skipped (already exists)")
            
            # Show progress every 10 entries
            if idx % 10 == 0:
                print(f"\n--- Progress: {idx}/{len(faq_data)} ({idx/len(faq_data)*100:.1f}%) ---\n")
        
        # Summary
        print("\n" + "=" * 70)
        print("Ingestion Complete")
        print("=" * 70)
        print(f"✓ Successfully stored: {stored_count}/{len(faq_data)}")
        print(f"⚠️  Skipped (duplicates): {skipped_count}/{len(faq_data)}")
        print(f"✗ Errors: {error_count}/{len(faq_data)}")
        print(f"📊 Total in database: {self.db_collection.count_documents({})}")
        print(f"💾 Database: {DATABASE_NAME}.{COLLECTION_NAME}")
        print("=" * 70)
    
    def close(self):
        """Close database connection."""
        if self.db_client:
            self.db_client.close()
            print("\n✓ Closed MongoDB connection")


def main():
    """Main execution function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Ingest FAQ data from CSV to MongoDB')
    parser.add_argument('--clear', action='store_true', 
                       help='Clear existing data before ingestion')
    parser.add_argument('--csv', type=str, default=CSV_FILE,
                       help=f'Path to CSV file (default: {CSV_FILE})')
    
    args = parser.parse_args()
    
    try:
        # Initialize ingestion system
        ingestion = CSVFAQIngestion()
        
        # Process CSV
        ingestion.process_csv(args.csv, clear_first=args.clear)
        
        # Close connections
        ingestion.close()
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
