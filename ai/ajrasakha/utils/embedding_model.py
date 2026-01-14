from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE
from langchain_huggingface import HuggingFaceEmbeddings
import os

HUGGINGFACE_CACHE_FOLDER = os.getenv("HUGGINGFACE_HUB_CACHE")

def get_huggingface_embedding_model(model_name: str, model_kwargs=None,encode_kwargs=None) -> HuggingFaceEmbeddings:
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