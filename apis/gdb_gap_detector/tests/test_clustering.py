from clustering import cosine_similarity


def test_similarity():

    a = [1.0, 0.0]

    b = [1.0, 0.0]

    assert cosine_similarity(a, b) == 1.0