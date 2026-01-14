from pymongo import MongoClient
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_huggingface import HuggingFaceEmbeddings

def get_mongodb_vector_store(
    embedding_model: HuggingFaceEmbeddings,
    mongo_connection_string: str,
    db_name: str,
    collection_name: str,
    index_name: str,
) -> MongoDBAtlasVectorSearch:
    """
    Initialize and return a MongoDB Atlas Vector Search vector store.
    """
    client = MongoClient(mongo_connection_string)

    database = client[db_name]
    collection = database[collection_name]

    vector_store = MongoDBAtlasVectorSearch(
        embedding=embedding_model,
        collection=collection,
        index_name=index_name,
    )
    return vector_store