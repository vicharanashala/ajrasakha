from priority import calculate_priority


def test_priority_score():

    cluster = {
        "size": 20,
        "growth_rate": 0.4,
        "districts": ["A", "B"],
        "coverage_score": 0.2,
        "pending_reviews": 0,
    }

    score = calculate_priority(cluster)

    assert score >= 0
    assert score <= 100