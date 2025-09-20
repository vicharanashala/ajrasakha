from typing import List
from llama_cloud import TextNode
from llama_index.core import VectorStoreIndex
from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from llama_index.core.schema import NodeWithScore
from constants import DB_NAME, DEFAULT_CITATION_CHUNK_OVERLAP, DEFAULT_CITATION_CHUNK_SIZE, INDEX_NAME
from pymongo import MongoClient
from llama_index.graph_stores.neo4j import Neo4jPropertyGraphStore
from llama_index.core import PropertyGraphIndex
from llama_index.llms.ollama import Ollama
from llama_index.core.indices.property_graph import (
    LLMSynonymRetriever,
    VectorContextRetriever,
)
from llama_index.core.indices.property_graph import SimpleLLMPathExtractor
from llama_index.core.indices.property_graph.retriever import PGRetriever
from models import (
    ContextPOP,
    ContextQuestionAnswerPair,
    POPMetaData,
    QuestionAnswerPairMetaData,
    KnowledgeGraphNodes,
)
from llama_index.core.schema import ( 
                                     MetadataMode, NodeWithScore, TextNode, )
from llama_index.core.node_parser import SentenceSplitter
from helpers import truncate
from typing import List
from itertools import groupby
import re
import spacy
nlp = spacy.load("en_core_web_sm")
import logging
logger = logging.getLogger("myapp")



# Data Retrievers


def get_retriever(
    client: MongoClient, collection_name: str, similarity_top_k: int = 3
) -> BaseRetriever:

    vector_store = MongoDBAtlasVectorSearch(
        client,
        db_name=DB_NAME,
        collection_name=collection_name,
        vector_index_name=INDEX_NAME,
        embedding_key="embedding",
        text_key="text",
        metadata_key="metadata",
    )
    index = VectorStoreIndex.from_vector_store(vector_store)
    retriever = index.as_retriever(similarity_top_k=similarity_top_k)
    return retriever


def get_graph_retriever():

    llm = Ollama(
        model="qwen3:1.7b", base_url="http://100.100.108.13:11434", request_timeout=120
    )

    graph_store = Neo4jPropertyGraphStore(
        username="neo4j",
        password="RoeDy6!EqHzh",
        url="bolt://100.100.108.15:7687",
    )

    data_extractor = SimpleLLMPathExtractor(llm=llm)

    index = PropertyGraphIndex.from_existing(
        kg_extractors=[data_extractor],
        property_graph_store=graph_store,
        show_progress=True,
    )

    synonym_retriever = LLMSynonymRetriever(
        index.property_graph_store,
        llm=llm,
        include_text=False,
    )

    vector_retriever = VectorContextRetriever(
        index.property_graph_store,
        include_text=False,
    )

    retriever: PGRetriever = index.as_retriever(
        sub_retrievers=[synonym_retriever, vector_retriever],
    )

    return retriever


# Data Processors


async def process_nodes_graph(nodes: List[NodeWithScore]) -> List[KnowledgeGraphNodes]:
    context: List[KnowledgeGraphNodes] = []
    for triplet in nodes:
        txt = triplet.text.strip()
        # crude parse assuming format "X -> Y -> Z"
        if "->" in txt:
            parts = [p.strip() for p in txt.split("->")]
            if len(parts) == 3:
                start, relation, end = parts
                context.append(
                    KnowledgeGraphNodes(
                        start_node=start,
                        relation_node=relation,
                        end_node=end,
                        score=getattr(triplet, "score", None),
                    )
                )
    return context


async def process_nodes_qa(
    nodes: List[NodeWithScore],
) -> List[ContextQuestionAnswerPair]:
    # Your stored format: "Question: ...\n\nAnswer: ..."
    context: List[ContextQuestionAnswerPair] = []
    for node in nodes:
        text = node.text
        q, a = text, ""
        if "\n\nAnswer:" in text:
            parts = text.split("\n\nAnswer:", 1)
            q = parts[0].replace("Question:", "", 1).strip()
            a = parts[1].strip()

        question_answer_pair = ContextQuestionAnswerPair(
            question=q,
            answer=a,
            meta_data=QuestionAnswerPairMetaData(
                agri_specialist=node.metadata.get("Agri Specialist", "Not Available"),
                crop=node.metadata.get("Crop", "Not Available"),
                sources=node.metadata.get(
                    "Source [Name and Link]", "Source Not Available"
                ),
                state=node.metadata.get("State", "Not Available"),
                similarity_score=node.score,
            ),
        )
        context.append(question_answer_pair)
    return context


async def process_nodes_pop(nodes: List[NodeWithScore]) -> List[ContextPOP]:
    # Your stored format: "Question: ...\n\nAnswer: ..."
    context: List[ContextPOP] = []
    for node in nodes:
        question_answer_pair = ContextPOP(
            text=node.text,
            meta_data=POPMetaData(
                page_no=node.metadata.get("page_no", "Not Available"),
                source=node.metadata.get("source", "https://linknotavailable.com"),
                topics=node.metadata.get("headings", "No topics available"),
                similarity_score=node.score,
            ),
        )
        context.append(question_answer_pair)
    return context


async def process_nodes_for_citations(nodes: List[NodeWithScore]) -> List[TextNode]:
    
    new_nodes: List[TextNode] = []
    
    # text_splitter = SentenceSplitter(
    #         chunk_size=DEFAULT_CITATION_CHUNK_SIZE,
    #         chunk_overlap=DEFAULT_CITATION_CHUNK_OVERLAP,
    #     )

    for node in nodes:
        doc = nlp(node.node.get_content(metadata_mode=MetadataMode.NONE))
        text_chunks = [sent.text.strip() for sent in doc.sents]
        metadata = node.node.metadata.copy() if node.node.metadata else {}

        logger.error(str(text_chunks))
        
        for text_chunk in text_chunks:
            metadata_with_source = metadata.copy()
            metadata_with_source["source_number"] = len(new_nodes) + 1
            new_node = TextNode(text=text_chunk, metadata=metadata_with_source)
            logger.warning(text_chunk)

            new_nodes.append(new_node)
            
    return new_nodes


# Data Renderers


async def render_graph_markdown(
    nodes: list[KnowledgeGraphNodes], should_truncate=False
) -> str:
    # Table header
    md = "| Start Node | Relation | End Node | Score |\n"
    md += "|------------|-----------|----------|-------|\n"

    # Rows
    for node in nodes:
        md += f"| {node.start_node} | {node.relation_node} | {node.end_node} | {node.score if node.score is not None else ''} |\n"

    return md+'\n'


async def render_qa_markdown(
    results: List[ContextQuestionAnswerPair], should_truncate: bool = True, max_len: int = 300
) -> str:
    """Render ContextQuestionAnswerPair objects into Markdown with truncation."""
    md_output = []
    for r in results:
        question = truncate(r.question, max_len) if should_truncate else r.question
        answer = (
            truncate(r.answer if r.answer else "Answer not available", max_len)
            if should_truncate
            else r.answer
        )

        md_output.append(
            f"""### ❓Golden Dataset Question
{question}

### ✅ Answer
{answer}

**Metadata**
- 👨‍🌾 Agri Specialist: {r.meta_data.agri_specialist}
- 🌱 Crop: {r.meta_data.crop}
- 📖 Source: {r.meta_data.sources}
- 🏞 State: {r.meta_data.state}
- 🔗 Similarity Score: {r.meta_data.similarity_score:.2f}
---
"""
        )
    return "\n".join(md_output)


async def render_pop_markdown(
    results: List[ContextPOP], should_truncate: bool = True, max_len: int = 300
) -> str:
    """Render ContextPOP objects into Markdown with truncation."""
    md_output = []
    for r in results:
        text = truncate(r.text, max_len) if should_truncate else r.text

        md_output.append(
            f"""### 📄 POP Reference
**Text**  
{text}

**Metadata**
- 📑 Page No: {r.meta_data.page_no}
- 📖 Source: {r.meta_data.source}
- 🏷 Topics: {r.meta_data.topics}
- 🔗 Similarity Score: {r.meta_data.similarity_score:.2f}
---
"""
        )
    return "\n".join(md_output)

async def render_citations(nodes: List[TextNode]):
    md = "\n| Ref. No | Text |\n"
    md += "|------------|-----------|\n"

    # Rows
    for index in range(len(nodes)):
        node = nodes[index]
        md += f"| {index+1} |{node.get_content(metadata_mode=MetadataMode.NONE).replace('\n', ' ')} |\n"

    return md

def extract_links(text: str):
    """Extract http/https links and return as Markdown short links."""
    urls = re.findall(r"https?://\S+", text)
    if not urls:
        return text  # keep raw if no links
    return ", ".join(f"[Link{i+1}]({u})" for i, u in enumerate(urls))


async def render_metadata_table(nodes: List[TextNode]) -> str:
    """Render metadata for nodes as a markdown table with source ranges."""
    
    # Extract (source_number, metadata) pairs
    items = []
    for node in nodes:
        meta = node.metadata
        items.append((meta["source_number"], meta))
    
    # Sort by source_number
    items.sort(key=lambda x: x[0])
    
    # Group consecutive source_numbers with identical metadata (ignoring source_number itself)
    grouped = []
    for _, group in groupby(items, key=lambda x: {
        k: v for k, v in x[1].items() if k != "source_number"
    }):
        group_list = list(group)
        start = group_list[0][0]
        end = group_list[-1][0]
        meta = group_list[0][1]
        grouped.append(((start, end), meta))
    
    # Render Markdown table
    table = "| References | Specialist | Sources | State | Crop |\n"
    table += "|---------|------------|---------|-------|------|\n"
    
    previous=1 
    for (start, end), meta in grouped:
        if start == end:
            source_range = str(previous)+"-"+str(start)
        else:
            source_range = f"{start}–{end}"
        
        sources = extract_links(meta.get("Source [Name and Link]", ""))
        
        table += (
            f"| {source_range} "
            f"| {meta.get('Agri Specialist', '')} "
            f"| {sources}"
            f"| {meta.get('State', '')} "
            f"| {meta.get('Crop', '')} |\n"
        )
        previous = end + 1
    
    return table
