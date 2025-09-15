import os
from typing import List
import pymongo
from pymongo.operations import SearchIndexModel
from llama_index.core import (
    SimpleDirectoryReader, VectorStoreIndex, StorageContext,
    Settings, PromptTemplate, get_response_synthesizer
)
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from llama_index.llms.ollama import Ollama
from llama_index.core.postprocessor import SentenceTransformerRerank
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.schema import NodeWithScore, QueryBundle


class MongoDBVectorStoreManager:
    def __init__(self, uri, vector_index_name="vector_index"):
        self.client = pymongo.MongoClient(uri)
        self.vector_index_name = vector_index_name
        # self.collection = self.client[db_name][collection_name]

    def get_vector_store(self, db_name, collection_name):
        return MongoDBAtlasVectorSearch(
            self.client,
            db_name=db_name,
            collection_name=collection_name,
            vector_index_name=self.vector_index_name
        )

    def create_search_index(self, db_name, collection_name, dim=1024):
        search_index_model = SearchIndexModel(
            definition={
                "fields": [
                    {"type": "vector", "path": "embedding", "numDimensions": dim, "similarity": "cosine"},
                    {"type": "filter", "path": "metadata.page_label"}
                ]
            },
            name=self.vector_index_name,
            type="vectorSearch"
        )
        try:
            collection = self.client[db_name][collection_name]
            collection.create_search_index(model=search_index_model)
            print("Search index created successfully.")
        except Exception as e:
            print("Failed to create search index:", e)


class DocumentLoader:
    def __init__(self, input_dir, exts=[".pdf"]):
        self.input_dir = input_dir
        self.exts = exts

    def load(self):
        loader = SimpleDirectoryReader(input_dir=self.input_dir, required_exts=self.exts, recursive=True)
        docs = loader.load_data()
        print(f"Loaded {len(docs)} documents.")
        return docs


class EmbeddingManager:
    def __init__(self, model_name="BAAI/bge-large-en-v1.5"):
        self.model_name = model_name

    def setup(self):
        embed_model = HuggingFaceEmbedding(model_name=self.model_name, trust_remote_code=True)
        Settings.embed_model = embed_model
        return embed_model


class BasicRetriever:
    def __init__(self, vector_store: MongoDBAtlasVectorSearch, docs=None):
        self.vector_store = vector_store
        self.docs = docs

        # Storage + Index
        storage_context = StorageContext.from_defaults(vector_store=self.vector_store)
        
        if docs is not None:
            self.index = VectorStoreIndex.from_documents(docs, storage_context=storage_context, show_progress=True)
        else:
            self.index = VectorStoreIndex.from_vector_store(vector_store=self.vector_store)

        # Retriever + Reranker
        self.retriever = self.index.as_retriever(similarity_top_k=10)
        self.rerank = SentenceTransformerRerank(
            model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_n=3
        )

    async def retrieve(self, query: str):
        nodes:List[NodeWithScore] = await self.retriever.aretrieve(query)
        reranked_nodes = await self.rerank._apostprocess_nodes(nodes=nodes, query_bundle=QueryBundle(query_str=query))
        return reranked_nodes

    def build_context(self, nodes: List[NodeWithScore], max_chars: int = 8000) -> List[str]:
        """Concatenate top nodes into a bounded context block (with lightweight citations)."""
        parts = []
        total = 0
        for i, n in enumerate(nodes, 1):
            text = n.node.get_content().strip()
            meta = n.node.metadata or {}
            tag = meta.get("page_label") or n.node.ref_doc_id or n.node.node_id or f"doc{i}"
            chunk = f"[{i} | src={tag} | score={n.score:.3f}]\n{text}\n"
            if total + len(chunk) > max_chars:
                break
            parts.append(chunk)
            total += len(chunk)
        return parts
