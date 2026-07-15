from .database import get_disclaimer_triggered_queries
from .nlp import get_embeddings
from .clustering import cluster_queries

def run_gap_analysis():
    """
    Core engine that pulls data, embeds it, clusters it,
    and identifies the top coverage gaps.
    """
    # 1. Pull data
    raw_queries = get_disclaimer_triggered_queries()
    if not raw_queries:
        return {"clusters": [], "top_gaps": []}
    
    # Extract just the text for embedding
    texts = [q.get("text", "") for q in raw_queries if "text" in q]
    
    # 2. Get Embeddings
    embeddings = get_embeddings(texts)
    
    # 3. Cluster
    clusters_dict = cluster_queries(embeddings)
    
    # 4. Analyze & Prioritize
    analyzed_clusters = []
    for cluster_id, indices in clusters_dict.items():
        if cluster_id == -1:
            continue # Skip noise
        
        # Gather stats
        cluster_texts = [texts[i] for i in indices]
        # In a real scenario we'd also aggregate crop/state/domain from raw_queries[i]
        
        analyzed_clusters.append({
            "cluster_id": int(cluster_id),
            "size": len(indices),
            "sample_queries": cluster_texts[:5], # Top 5 samples to represent the intent
            "urgency_score": len(indices) * 1.5 # simple mock scoring logic
        })
        
    # Sort by size (demand) descending
    analyzed_clusters.sort(key=lambda x: x["size"], reverse=True)
    
    return {
        "total_queries_analyzed": len(raw_queries),
        "total_clusters_found": len(analyzed_clusters),
        "top_gaps": analyzed_clusters[:20] # Return top 20
    }

if __name__ == "__main__":
    report = run_gap_analysis()
    print(f"Gap Analysis Report: {report['total_clusters_found']} clusters found.")
