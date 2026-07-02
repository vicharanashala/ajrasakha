# imd_api_wrapper/wrapper/api_mapping.py
# ─────────────────────────────────────────────────────────────
# Maps farmer needs and clusters to IMD endpoints.
# All numbers come from the KCC 15.5M cluster analysis.
# ─────────────────────────────────────────────────────────────

from .config import (
    CLUSTER_TO_NEED,
    NEED_TO_ENDPOINT,
    CLUSTER_QUERY_COUNTS,
    TOTAL_QUERIES_PER_NEED,
    TOTAL_WEATHER_QUERIES,
    PRIORITY,
    FRESHNESS_MINUTES,
    FARMER_NEED,
)


def get_endpoint_for_cluster(cluster_id: int) -> dict:
    """
    Given a cluster ID (0-58), return the recommended IMD endpoint
    and full metadata for that cluster.

    Parameters
    ----------
    cluster_id : int
        Cluster number from the KCC analysis (0 to 58).

    Returns
    -------
    dict with keys:
        cluster_id, farmer_need, endpoint_key, priority,
        freshness_minutes, cluster_queries, need_queries,
        cluster_coverage_pct, need_coverage_pct
    """
    if cluster_id not in CLUSTER_TO_NEED:
        raise ValueError(
            f"Cluster {cluster_id} not found. Valid range: 0-58."
        )

    need         = CLUSTER_TO_NEED[cluster_id]
    endpoint_key = NEED_TO_ENDPOINT[need]
    c_queries    = CLUSTER_QUERY_COUNTS[cluster_id]
    n_queries    = TOTAL_QUERIES_PER_NEED[need]

    return {
        "cluster_id"           : cluster_id,
        "farmer_need"          : need,
        "endpoint_key"         : endpoint_key,
        "priority"             : PRIORITY[endpoint_key],
        "freshness_minutes"    : FRESHNESS_MINUTES[endpoint_key],
        "cluster_queries"      : c_queries,
        "need_queries"         : n_queries,
        "cluster_coverage_pct" : round(c_queries / TOTAL_WEATHER_QUERIES * 100, 4),
        "need_coverage_pct"    : round(n_queries / TOTAL_WEATHER_QUERIES * 100, 2),
    }


def get_endpoint_for_need(farmer_need: str) -> dict:
    """
    Given a farmer need label, return the recommended IMD endpoint.

    Parameters
    ----------
    farmer_need : str
        One of the six needs identified from KCC clustering.

    Returns
    -------
    dict with endpoint metadata.
    """
    valid = list(NEED_TO_ENDPOINT.keys())
    if farmer_need not in NEED_TO_ENDPOINT:
        raise ValueError(
            f"Unknown farmer need: '{farmer_need}'.\nValid: {valid}"
        )

    endpoint_key = NEED_TO_ENDPOINT[farmer_need]
    n_queries    = TOTAL_QUERIES_PER_NEED[farmer_need]

    return {
        "farmer_need"       : farmer_need,
        "endpoint_key"      : endpoint_key,
        "priority"          : PRIORITY[endpoint_key],
        "freshness_minutes" : FRESHNESS_MINUTES[endpoint_key],
        "need_queries"      : n_queries,
        "need_coverage_pct" : round(n_queries / TOTAL_WEATHER_QUERIES * 100, 2),
    }


def get_full_mapping_table():
    """
    Returns a list of dicts covering all 59 clusters with their
    farmer need, recommended endpoint, and query statistics.
    Useful for building a summary DataFrame.
    """
    rows = []
    for cluster_id in sorted(CLUSTER_TO_NEED.keys()):
        rows.append(get_endpoint_for_cluster(cluster_id))
    return rows


def get_need_summary():
    """
    Returns a list of dicts summarising each of the 6 farmer needs,
    sorted by total query volume (descending).
    """
    rows = []
    for need, endpoint_key in NEED_TO_ENDPOINT.items():
        n_queries = TOTAL_QUERIES_PER_NEED[need]
        rows.append({
            "farmer_need"       : need,
            "endpoint_key"      : endpoint_key,
            "priority"          : PRIORITY[endpoint_key],
            "freshness_minutes" : FRESHNESS_MINUTES[endpoint_key],
            "total_queries"     : n_queries,
            "coverage_pct"      : round(n_queries / TOTAL_WEATHER_QUERIES * 100, 2),
        })
    return sorted(rows, key=lambda r: r["total_queries"], reverse=True)