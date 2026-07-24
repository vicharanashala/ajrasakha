from database import get_disclaimer_triggered_queries
from nlp import get_embeddings
from clustering import cluster_queries

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
    
    from collections import Counter
    from datetime import datetime, timezone

    # 4. Analyze & Prioritize
    analyzed_clusters = []
    now = datetime.now(timezone.utc)
    
    for cluster_id, indices in clusters_dict.items():
        if cluster_id == -1:
            continue # Skip noise
        
        cluster_texts = [texts[i] for i in indices]
        
        # Multi-Dimensional Clustering metadata
        crops = [raw_queries[i].get("crop") for i in indices if raw_queries[i].get("crop")]
        states = [raw_queries[i].get("state") for i in indices if raw_queries[i].get("state")]
        domains = [raw_queries[i].get("domain") for i in indices if raw_queries[i].get("domain")]
        
        majority_crop = Counter(crops).most_common(1)[0][0] if crops else "Unknown"
        majority_state = Counter(states).most_common(1)[0][0] if states else "Unknown"
        majority_domain = Counter(domains).most_common(1)[0][0] if domains else "Unknown"
        
        # Time-Based Growth Detection
        recent_count = 0
        previous_count = 0
        for i in indices:
            ts_val = raw_queries[i].get("timestamp")
            if not ts_val:
                continue
            
            if isinstance(ts_val, str):
                try:
                    ts = datetime.fromisoformat(ts_val.replace("Z", "+00:00"))
                except ValueError:
                    continue
            else:
                ts = ts_val
                
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
                
            days_diff = (now - ts).days
            if 0 <= days_diff <= 14:
                recent_count += 1
            elif 14 < days_diff <= 28:
                previous_count += 1
                
        growth_rate = (recent_count - previous_count) / max(1, previous_count)
        
        if growth_rate > 0.2 and len(indices) > 5:
            trend = "growing"
        elif growth_rate < -0.2:
            trend = "shrinking"
        else:
            trend = "flat"
            
        # Urgency Score: cluster_size * (1 + max(0, growth_rate))
        # This ensures rapidly growing small clusters can outrank large but stagnant ones.
        urgency_score = len(indices) * (1 + max(0, growth_rate))
        
        analyzed_clusters.append({
            "cluster_id": int(cluster_id),
            "size": len(indices),
            "sample_queries": cluster_texts[:5],
            "crop": majority_crop,
            "state": majority_state,
            "domain": majority_domain,
            "growth_rate": round(growth_rate, 2),
            "trend": trend,
            "urgency_score": round(urgency_score, 2)
        })
        
    # Sort by urgency descending
    analyzed_clusters.sort(key=lambda x: x["urgency_score"], reverse=True)
    
    return {
        "total_queries_analyzed": len(raw_queries),
        "total_clusters_found": len(analyzed_clusters),
        "top_gaps": analyzed_clusters[:20]
    }

def get_heatmap_data():
    """
    Derives heatmap values from actual clustered and tagged data,
    aggregated by state and crop.
    """
    from collections import defaultdict
    report = run_gap_analysis()
    top_gaps = report.get("top_gaps", [])
    
    # Aggregate cluster size by state and crop
    heatmap_agg = defaultdict(int)
    for gap in top_gaps:
        state = gap.get("state", "Unknown")
        crop = gap.get("crop", "Unknown")
        heatmap_agg[(state, crop)] += gap.get("size", 0)
        
    data = []
    for (state, crop), val in heatmap_agg.items():
        data.append({
            "id": f"{state}-{crop}",
            "state": state,
            "crop": crop,
            "value": val
        })
        
    return {"heatmap": data}

if __name__ == "__main__":
    report = run_gap_analysis()
    print(f"Gap Analysis Report: {report['total_clusters_found']} clusters found.")
