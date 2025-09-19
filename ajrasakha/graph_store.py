from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import PropertyGraphIndex
from llama_index.core.indices.property_graph import (
    PropertyGraphIndex,
    PGRetriever,
    LLMSynonymRetriever,
    VectorContextRetriever,
    SimpleLLMPathExtractor
)
from llama_index.graph_stores.neo4j import Neo4jPropertyGraphStore
from llama_index.llms.ollama import Ollama
from llama_index.core.schema import NodeWithScore
from typing import List
from pydantic import BaseModel


'''
Usage:

    retriever = get_graph_retriever() # Get the retriever
    context = await retriever.aretrieve("What are aphids?") # Retrieve subgraph based on query 
    nodes = process_nodes_graph(context_nodes) # Convert to Pydantic model
    
    context = render_graph_markdown(nodes) # Returns a multiline markdown string
'''
    

class KnowledgeGraphNodes(BaseModel):
    start_node: str
    relation_node: str
    end_node: str
    score: float | None

def get_graph_retriever():
    embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-large-en-v1.5",
                                        trust_remote_code=True,
                                        cache_folder='./hf_cache')

    llm = Ollama(
        model="qwen3:1.7b", 
        base_url="http://100.100.108.13:11434", 
        request_timeout=120
    )

    graph_store = Neo4jPropertyGraphStore(
        username="neo4j",
        password="RoeDy6!EqHzh",
        url="bolt://100.100.108.15:7687",
    )

    data_extractor = SimpleLLMPathExtractor(llm=llm)

    index = PropertyGraphIndex.from_existing(
        embed_model=embed_model,
        kg_extractors=[data_extractor],
        property_graph_store=graph_store,
        show_progress=True,
    )

    synonym_retriever = LLMSynonymRetriever(
        graph_store=index.property_graph_store,
        llm=llm,
        include_text=False,
    )

    vector_retriever = VectorContextRetriever(
        graph_store=index.property_graph_store,
        include_text=False,
    )

    retriever: PGRetriever = index.as_retriever(
        sub_retrievers=[
            synonym_retriever,
            vector_retriever
        ],
    )
    
    return retriever


async def process_nodes_graph(nodes: List[NodeWithScore]) -> List[KnowledgeGraphNodes]:
    context: List[KnowledgeGraphNodes] = []
    for triplet in nodes:
        txt = triplet.text.strip()
        if "->" in txt:
            parts = [p.strip() for p in txt.split("->")]
            if len(parts) == 3:
                start, relation, end = parts
                context.append(KnowledgeGraphNodes(
                    start_node=start,
                    relation_node=relation,
                    end_node=end,
                    score=getattr(triplet, "score", None)
                ))
    return context

async def render_graph_markdown(nodes: list[KnowledgeGraphNodes]) -> str:
    # Table header
    md = "| Start Node | Relation | End Node | Score |\n"
    md += "|------------|-----------|----------|-------|\n"
    
    # Rows
    for node in nodes:
        md += f"| {node.start_node} | {node.relation_node} | {node.end_node} | {node.score if node.score is not None else ''} |\n"
    
    return md 


