from reporting import generate_gap_statistics


def test_statistics():

    clusters = []

    stats = generate_gap_statistics(clusters)

    assert stats.total_clusters == 0