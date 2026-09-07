import os
import glob
from pymongo import MongoClient
import glob
from PyPDF2 import PdfReader
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from google import genai
import time

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))
gemini_client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

def get_embedding(text: str) -> list[float]:
    time.sleep(0.2) # Rate limit protection
    response = gemini_client.models.embed_content(model='text-embedding-004', contents=text)
    return response.embeddings[0].values

def ingest_pop():
    print("Connecting to MongoDB Atlas...")
    mongo_uri = os.getenv('MONGODB_URI')
    if not mongo_uri:
        print("Error: MONGODB_URI not found in .env")
        return

    client_mongo = MongoClient(mongo_uri)
    db = client_mongo[os.getenv('DB_NAME', 'ajrasakha')]
    collection = db[os.getenv('POP_COLLECTION', 'pop_v2')]

    docs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../docs'))
    pdf_files = glob.glob(os.path.join(docs_path, '*.pdf'))
    
    if not pdf_files:
        print(f"Error: No PDF files found in {docs_path}")
        return

    print(f"Found {len(pdf_files)} PDF files. Processing...")
    
    # We clear the collection to avoid duplicates during testing
    collection.delete_many({})
    print("Cleared existing entries in 'pop_v2'")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )

    total_chunks = 0
    for pdf_file in pdf_files:
        filename = os.path.basename(pdf_file)
        print(f"Reading {filename}...")
        try:
            reader = PdfReader(pdf_file)
            full_text = ""
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    full_text += extracted + "\n"
            
            chunks = text_splitter.split_text(full_text)
            print(f"  -> Split into {len(chunks)} chunks. Embedding...")
            
            documents_to_insert = []
            for i, chunk in enumerate(chunks):
                emb = get_embedding(chunk)
                documents_to_insert.append({
                    "source": filename,
                    "chunk_index": i,
                    "text": chunk,
                    "embedding": emb,
                    # Storing a generic metadata state field so the router can filter if needed
                    "metadata": {
                        "state": "MULTIPLE", 
                        "filename": filename
                    }
                })
            
            if documents_to_insert:
                collection.insert_many(documents_to_insert)
                total_chunks += len(documents_to_insert)
                print(f"  -> Inserted {len(documents_to_insert)} chunks into MongoDB.")
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")

    print(f"\nSuccessfully ingested {total_chunks} total chunks into the PoP Vector Database!")
    print("\nIMPORTANT: To query this data with Vector Search, ensure you have created an Atlas Vector Search index on the 'embedding' field in the 'pop_v2' collection in your MongoDB Atlas dashboard.")

if __name__ == "__main__":
    ingest_pop()
