import os
import hashlib
from datetime import datetime, timedelta
import numpy as np
from sklearn.cluster import HDBSCAN
from pymongo import MongoClient
from overlap_check import OverlapChecker

def get_md5(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()

class GapPipeline:
    def __init__(self):
        # Configuration loading
        self.db_url = os.getenv("DB_URL", "mongodb://localhost:27017")
        self.time_window_days = int(os.getenv("TIME_WINDOW_DAYS", "30"))
        self.min_cluster_size = int(os.getenv("MIN_CLUSTER_SIZE", "3"))

        self.client = MongoClient(self.db_url)
        self.prod_db = self.client["farmer_feedback"]
        self.logs_col = self.prod_db["disclaimer_logs"]
        
        self.my_db = self.client["gdb_gap_detector"]
        self.embeddings_col = self.my_db["query_embeddings"]
        self.clusters_col = self.my_db["clusters"]
        self.reports_col = self.my_db["reports"]

        print("Initializing Overlap Checker...")
        self.checker = OverlapChecker(self.client)

    def run(self):
        print("\n=== STARTING GDB COVERAGE GAP PIPELINE ===")
        
        # 1. Fetch recent disclaimer logs
        cutoff_date = datetime.utcnow() - timedelta(days=self.time_window_days)
        print(f"Fetching unanswered disclaimer logs since {cutoff_date}...")
        
        query_filter = {
            "status": "unanswered",
            "timestamp": {"$gte": cutoff_date}
        }
        logs = list(self.logs_col.find(query_filter))
        print(f"Retrieved {len(logs)} unanswered queries.")

        if not logs:
            print("No new queries to analyze. Exiting.")
            self._generate_empty_report()
            return

        # 2. Compute/Retrieve query embeddings and cache them
        print("Processing embeddings...")
        queries_data = []
        for log in logs:
            query_text = log.get("query")
            if not query_text:
                continue
                
            q_hash = get_md5(query_text)
            
            # Check embedding cache first
            cache_entry = self.embeddings_col.find_one({"_id": q_hash})
            if cache_entry and "embedding" in cache_entry:
                embedding = cache_entry["embedding"]
            else:
                # Compute embedding
                embedding = self.checker.embed_model.encode(query_text).tolist()
                self.embeddings_col.update_one(
                    {"_id": q_hash},
                    {"$set": {"query": query_text, "embedding": embedding}},
                    upsert=True
                )
                
            queries_data.append({
                "id": str(log["_id"]),
                "query": query_text,
                "embedding": embedding,
                "state": log.get("state") or "Unknown",
                "domain": log.get("domain") or "General",
                "timestamp": log.get("timestamp")
            })

        # 3. Partition queries by (state, domain)
        print("Partitioning queries by geography and domain...")
        partitions = {}
        for q in queries_data:
            key = (q["state"], q["domain"])
            if key not in partitions:
                partitions[key] = []
            partitions[key].append(q)

        # 4. Perform Clustering within each partition
        print(f"Clustering within {len(partitions)} partitions...")
        all_clusters_summary = []
        cluster_global_id = 0

        for (state, domain), partition_queries in partitions.items():
            count = len(partition_queries)
            if count < self.min_cluster_size:
                # Too few queries to form a cluster
                continue
                
            # Extract embeddings for clustering
            embeddings = np.array([q["embedding"] for q in partition_queries]).astype("float32")
            
            # Run HDBSCAN
            hdb = HDBSCAN(min_cluster_size=self.min_cluster_size, metric='euclidean')
            labels = hdb.fit_predict(embeddings)
            
            # Process clusters found (ignore noise label -1)
            unique_labels = set(labels)
            for label in unique_labels:
                if label == -1:
                    continue
                    
                # Collect member queries
                cluster_queries = [partition_queries[i] for i, l in enumerate(labels) if l == label]
                cluster_size = len(cluster_queries)
                
                # Compute Centroid
                cluster_embeddings = np.array([q["embedding"] for q in cluster_queries])
                centroid = np.mean(cluster_embeddings, axis=0)
                
                # Find Representative (closest to centroid)
                distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
                best_idx = np.argmin(distances)
                rep_query = cluster_queries[best_idx]["query"]
                
                # 5. Overlap check with GDB
                is_duplicate, best_match_id, score, explanation = self.checker.check_overlap(rep_query)
                if is_duplicate:
                    # Skip duplicate clusters since GDB already covers it
                    continue
                    
                # We found a gap! Calculate priority score and metadata
                # Calculate simple velocity/trend (queries in last 7 days vs previous 23 days)
                seven_days_ago = datetime.utcnow() - timedelta(days=7)
                recent_count = sum(1 for q in cluster_queries if q["timestamp"] >= seven_days_ago)
                older_count = cluster_size - recent_count
                
                # Growth rate: simple ratio or score
                growth_rate = float(recent_count / max(1, older_count))
                
                # Priority Score formula: size * (1 + growth_rate)
                priority_score = float(cluster_size * (1.0 + min(growth_rate, 2.0)))
                
                priority_level = "LOW"
                if priority_score >= 15:
                    priority_level = "CRITICAL"
                elif priority_score >= 8:
                    priority_level = "HIGH"
                elif priority_score >= 4:
                    priority_level = "MEDIUM"
                    
                # Extract key terms/keywords (simplistic keyword extraction)
                stopwords = {"how", "to", "control", "what", "is", "the", "in", "for", "on", "of", "a", "an", "and", "in", "leaves", "crop", "medicine"}
                words = []
                for q in cluster_queries:
                    words.extend([w.lower() for w in q["query"].split() if w.isalnum() and w.lower() not in stopwords])
                
                # Top 5 unique keywords
                unique_words = sorted(set(words), key=words.count, reverse=True)[:5]

                # Map state, domain, and crop distributions
                # (For simplicity we assume crop is parsed from query or logs. disclaimer_logs does not have explicit crop in the sample schema, but we can match from GDB keywords if needed, or default to general/crop-agnostic)
                crop_distribution = {"General": cluster_size}
                
                cluster_global_id += 1
                cluster_summary = {
                    "cluster_id": str(cluster_global_id),
                    "cluster_name": " / ".join(unique_words[:3]),
                    "size": cluster_size,
                    "keywords": unique_words,
                    "sample_queries": list(set([q["query"] for q in cluster_queries]))[:5],
                    "domains": [domain],
                    "states": [state],
                    "growth_rate": growth_rate,
                    "priority_score": priority_score,
                    "farmer_demand": cluster_size,
                    "recommended_action": f"{priority_level} - Allocate expert content writing for this gap.",
                    "priority_level": priority_level,
                    "crop_distribution": crop_distribution,
                    "state_distribution": {state: cluster_size},
                    "domain_distribution": {domain: cluster_size},
                    "language_distribution": {"en": cluster_size},
                    "created_at": datetime.utcnow()
                }
                all_clusters_summary.append(cluster_summary)

        # 6. Calculate Heatmap Statistics
        print("Calculating coverage heatmap...")
        heatmap_data = self._calculate_heatmap(cutoff_date)

        # 7. Generate Outreach Recommendations
        print("Compiling outreach recommendations...")
        outreach_recs = self._calculate_outreach_recommendations(heatmap_data)

        # 8. Sort Gaps by priority score
        all_clusters_summary = sorted(all_clusters_summary, key=lambda x: x["priority_score"], reverse=True)
        top_gaps = all_clusters_summary[:20]

        # Save individual clusters to database
        self.clusters_col.delete_many({})
        if all_clusters_summary:
            self.clusters_col.insert_many(all_clusters_summary)

        # Compile final report payload
        report = {
            "report_type": "weekly",
            "period_days": self.time_window_days,
            "start_date": cutoff_date,
            "end_date": datetime.utcnow(),
            "generated_at": datetime.utcnow(),
            "total_disclaimers": len(logs),
            "unique_queries": len(queries_data),
            "clusters_found": len(all_clusters_summary),
            "top_gaps": top_gaps,
            "coverage_stats": heatmap_data,
            "outreach_recommendations": outreach_recs,
            "domains_with_gaps": self._get_breakdown(heatmap_data, "domain"),
            "states_with_gaps": self._get_breakdown(heatmap_data, "state")
        }

        # Save to database
        self.reports_col.insert_one(report)
        print(f"Successfully generated weekly gap report with {len(top_gaps)} top gaps.")
        print("=== PIPELINE RUN COMPLETE ===\n")

    def _calculate_heatmap(self, cutoff_date):
        """Calculates GDB coverage scores per State-Domain combination."""
        # Fetch active states and domains from logs
        states = self.logs_col.distinct("state")
        domains = self.logs_col.distinct("domain")

        heatmap = []
        total_comb = 0
        covered = 0
        partial = 0
        gaps = 0

        gdb_col = self.prod_db["gdb_entries"]

        for state in states:
            if not state or state == "Unknown":
                continue
            for domain in domains:
                if not domain:
                    continue
                
                total_comb += 1
                
                # Fetch counts
                gdb_count = gdb_col.count_documents({"state": state, "domain": domain})
                disclaimer_count = self.logs_col.count_documents({
                    "state": state,
                    "domain": domain,
                    "status": "unanswered",
                    "timestamp": {"$gte": cutoff_date}
                })

                total = gdb_count + disclaimer_count
                if total == 0:
                    coverage_score = 100.0
                    status = "good"
                    covered += 1
                else:
                    coverage_score = float((gdb_count / total) * 100)
                    if coverage_score >= 80:
                        status = "good"
                        covered += 1
                    elif coverage_score >= 30:
                        status = "partial"
                        partial += 1
                    else:
                        status = "gap"
                        gaps += 1

                heatmap.append({
                    "domain": domain,
                    "state": state,
                    "gdb_count": gdb_count,
                    "disclaimer_count": disclaimer_count,
                    "coverage_score": coverage_score,
                    "status": status
                })

        return {
            "heatmap": heatmap,
            "total_combinations": total_comb,
            "covered": covered,
            "partial": partial,
            "gaps": gaps
        }

    def _calculate_outreach_recommendations(self, heatmap_data):
        """Builds list of focus target recommendations for field teams."""
        heatmap = heatmap_data.get("heatmap", [])
        # Sort combinations by disclaimer counts descending
        sorted_heatmap = sorted(heatmap, key=lambda x: x["disclaimer_count"], reverse=True)
        
        recommendations = []
        for item in sorted_heatmap[:10]:
            if item["disclaimer_count"] == 0:
                continue
                
            priority = "LOW"
            if item["disclaimer_count"] >= 15:
                priority = "HIGH"
            elif item["disclaimer_count"] >= 5:
                priority = "MEDIUM"

            recommendations.append({
                "target_state": item["state"],
                "focus_domain": item["domain"],
                "gap_questions": item["disclaimer_count"],
                "recommendation": f"Conduct field visits in {item['state']} focusing on {item['domain']}. Collect expert Q&A for top {item['disclaimer_count']} unanswered questions.",
                "priority": priority
            })
            
        return recommendations

    def _get_breakdown(self, heatmap_data, key_type):
        """Calculates disclaimer counts aggregated by state or domain."""
        heatmap = heatmap_data.get("heatmap", [])
        counts = {}
        for item in heatmap:
            val = item.get(key_type)
            disc = item.get("disclaimer_count", 0)
            if disc > 0:
                counts[val] = counts.get(val, 0) + disc
                
        sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        return [{key_type: k, "gap_count": v} for k, v in sorted_counts]

    def _generate_empty_report(self):
        """Creates an empty template report if no disclaimer logs are found."""
        report = {
            "report_type": "weekly",
            "period_days": self.time_window_days,
            "start_date": datetime.utcnow() - timedelta(days=self.time_window_days),
            "end_date": datetime.utcnow(),
            "generated_at": datetime.utcnow(),
            "total_disclaimers": 0,
            "unique_queries": 0,
            "clusters_found": 0,
            "top_gaps": [],
            "coverage_stats": {
                "heatmap": [],
                "total_combinations": 0,
                "covered": 0,
                "partial": 0,
                "gaps": 0
            },
            "outreach_recommendations": [],
            "domains_with_gaps": [],
            "states_with_gaps": []
        }
        self.reports_col.insert_one(report)

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    pipeline = GapPipeline()
    pipeline.run()
