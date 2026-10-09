from sklearn.cluster import DBSCAN
import numpy as np
from collections import defaultdict

def cluster_queries(embeddings, eps=0.5, min_samples=2):
    """
    Cluster the query embeddings using DBSCAN.
    DBSCAN is effective here as we don't know the number of clusters (intents) beforehand.
    Note: This only clusters by semantic text similarity. Metadata tagging (crop/state/domain) 
    is handled by the engine after clusters are formed.
    """
    if len(embeddings) == 0:
        return []

    # Initialize DBSCAN
    clustering_model = DBSCAN(eps=eps, min_samples=min_samples, metric='cosine')
    
    # Fit the model
    clustering_model.fit(embeddings)
    
    # Get cluster labels
    labels = clustering_model.labels_
    
    # Group indices by cluster
    clusters = defaultdict(list)
    for idx, label in enumerate(labels):
        clusters[label].append(idx)
        
    return dict(clusters)

if __name__ == "__main__":
    # Test clustering with dummy data
    dummy_embeddings = np.random.rand(10, 384) # 10 queries, 384-dimensional embeddings
    clusters = cluster_queries(dummy_embeddings)
    print(f"Found {len(clusters)} clusters (including noise as -1).")
