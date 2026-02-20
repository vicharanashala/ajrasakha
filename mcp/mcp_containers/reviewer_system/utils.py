import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_mongodb import MongoDBAtlasVectorSearch
from pymongo import MongoClient

HUGGINGFACE_CACHE_FOLDER = os.getenv("HUGGINGFACE_HUB_CACHE")

def get_huggingface_embedding_model(model_name: str, model_kwargs=None, encode_kwargs=None) -> HuggingFaceEmbeddings:
    if encode_kwargs is None:
        encode_kwargs = {'normalize_embeddings': True}
    if model_kwargs is None:
        model_kwargs = {'device': 'cpu'}

    embedding_model = HuggingFaceEmbeddings(
        model_name=model_name,
        model_kwargs=model_kwargs,
        encode_kwargs=encode_kwargs,
        cache_folder=HUGGINGFACE_CACHE_FOLDER,
    )

    return embedding_model


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
