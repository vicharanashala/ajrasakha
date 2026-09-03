#!/usr/bin/env python3
"""
Query Clustering Service
Uses TF-IDF + KMeans (sklearn) or sentence-transformers for semantic clustering
"""

import sys
import re
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from shared.mongodb import get_db


class QueryClusterer:
    """Cluster disclaimer queries by semantic similarity"""

    def __init__(self):
        self.db = get_db()
        self._sklearn_available = False
        self._sentence_transformers_available = False

        # Try importing ML libraries
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.cluster import KMeans, AgglomerativeClustering
            from sklearn.metrics.pairwise import cosine_similarity
            self._sklearn_available = True
        except ImportError:
            pass

        try:
            from sentence_transformers import SentenceTransformer
            self._sentence_transformers_available = True
        except ImportError:
            pass

    def normalize_query(self, query: str) -> str:
        """Normalize query for clustering"""
        q = query.lower().strip()
        q = re.sub(r'[^\w\s]', ' ', q)
        q = re.sub(r'\s+', ' ', q)
        # Remove common prefixes
        for prefix in ['how to', 'what is', 'tell me about', 'explain']:
            if q.startswith(prefix):
                q = q[len(prefix):].strip()
        return q

    def cluster_by_keywords(
        self,
        queries: List[Dict],
        min_cluster_size: int = 2
    ) -> List[Dict]:
        """Cluster queries using keyword overlap (fallback)"""
        from collections import defaultdict

        # Group by normalized keywords
        clusters = defaultdict(list)

        for q in queries:
            query_text = q.get('query', '')
            normalized = self.normalize_query(query_text)

            # Extract top keywords
            keywords = self._extract_keywords(normalized)

            # Use first 2 keywords as cluster key
            cluster_key = '|'.join(sorted(keywords)[:2]) if len(keywords) >= 2 else normalized[:50]

            clusters[cluster_key].append({
                **q,
                "keywords": keywords,
                "normalized": normalized
            })

        # Convert to list of clusters
        result = []
        for cluster_key, items in clusters.items():
            if len(items) >= min_cluster_size or len(clusters) <= 10:
                # Combine keywords
                all_keywords = set()
                for item in items:
                    all_keywords.update(item.get('keywords', []))

                result.append({
                    "cluster_id": cluster_key[:50],
                    "cluster_name": self._generate_cluster_name(items),
                    "size": len(items),
                    "keywords": list(all_keywords)[:10],
                    "queries": [item.get('query', '') for item in items[:5]],
                    "items": items,
                    "domains": list(set(item.get('domain') for item in items if item.get('domain'))),
                    "states": list(set(item.get('state') for item in items if item.get('state'))),
                    "first_seen": min(item.get('timestamp') for item in items) if items else None,
                    "last_seen": max(item.get('timestamp') for item in items) if items else None,
                })

        # Sort by size
        result.sort(key=lambda x: x['size'], reverse=True)
        return result

    def cluster_with_sklearn(
        self,
        queries: List[Dict],
        n_clusters: Optional[int] = None,
        min_cluster_size: int = 2
    ) -> List[Dict]:
        """Cluster using TF-IDF + KMeans"""
        if not self._sklearn_available:
            print("sklearn not available, using keyword clustering")
            return self.cluster_by_keywords(queries, min_cluster_size)

        if len(queries) < 2:
            return []

        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans, AgglomerativeClustering

        texts = [self.normalize_query(q.get('query', '')) for q in queries]

        # TF-IDF vectorization
        vectorizer = TfidfVectorizer(
            max_features=100,
            stop_words='english',
            ngram_range=(1, 2)
        )

        try:
            tfidf_matrix = vectorizer.fit_transform(texts)
        except Exception as e:
            print(f"TF-IDF failed: {e}")
            return self.cluster_by_keywords(queries, min_cluster_size)

        # Determine number of clusters
        if n_clusters is None:
            n_clusters = max(2, min(len(queries) // 3, 15))

        # Use Agglomerative clustering for small datasets
        if len(queries) < 20:
            clustering = AgglomerativeClustering(
                n_clusters=min(n_clusters, len(queries)),
                metric='cosine',
                linkage='average'
            )
            labels = clustering.fit_predict(tfidf_matrix.toarray())
        else:
            clustering = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = clustering.fit_predict(tfidf_matrix)

        # Group queries by cluster
        clusters_dict = {}
        for idx, label in enumerate(labels):
            if label not in clusters_dict:
                clusters_dict[label] = []
            clusters_dict[label].append(queries[idx])

        # Convert to output format
        result = []
        for cluster_id, items in clusters_dict.items():
            if len(items) >= min_cluster_size:
                all_keywords = set()
                for item in items:
                    keywords = self._extract_keywords(self.normalize_query(item.get('query', '')))
                    all_keywords.update(keywords)

                result.append({
                    "cluster_id": f"cluster_{cluster_id}",
                    "cluster_name": self._generate_cluster_name(items),
                    "size": len(items),
                    "keywords": list(all_keywords)[:10],
                    "queries": [item.get('query', '') for item in items[:5]],
                    "items": items,
                    "domains": list(set(item.get('domain') for item in items if item.get('domain'))),
                    "states": list(set(item.get('state') for item in items if item.get('state'))),
                    "first_seen": min(item.get('timestamp') for item in items) if items else None,
                    "last_seen": max(item.get('timestamp') for item in items) if items else None,
                })

        result.sort(key=lambda x: x['size'], reverse=True)
        return result

    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text"""
        stop_words = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their',
            'my', 'your', 'his', 'her', 'its', 'our', 'this', 'that', 'these', 'those',
            'what', 'how', 'why', 'when', 'where', 'which', 'who',
            'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of', 'to', 'in', 'on', 'at',
            'with', 'from', 'as', 'can', 'could', 'may', 'might', 'must',
        }
        words = text.split()
        return [w for w in words if w not in stop_words and len(w) > 2][:5]

    def _generate_cluster_name(self, items: List[Dict]) -> str:
        """Generate a human-readable cluster name"""
        if not items:
            return "Unknown Cluster"

        # Find most common keywords
        from collections import Counter
        keyword_counter = Counter()
        for item in items:
            keywords = self._extract_keywords(self.normalize_query(item.get('query', '')))
            for kw in keywords:
                keyword_counter[kw] += 1

        top_keywords = [kw for kw, count in keyword_counter.most_common(3)]
        if top_keywords:
            return ' / '.join(top_keywords)

        return items[0].get('query', '')[:50]


clusterer = QueryClusterer()
