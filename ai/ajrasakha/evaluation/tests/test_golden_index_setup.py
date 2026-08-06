from ajrasakha.evaluation.golden_index_setup import (
    ANSWER_VECTOR_INDEX,
    QUESTION_TEXT_INDEX,
    QUESTION_VECTOR_INDEX,
    REQUIRED_INDEXES,
    golden_index_env_values,
)


def test_required_golden_indexes_are_declared():
    names = {index.name for index in REQUIRED_INDEXES}

    assert QUESTION_VECTOR_INDEX in names
    assert ANSWER_VECTOR_INDEX in names
    assert QUESTION_TEXT_INDEX in names


def test_vector_indexes_target_embedding_fields():
    vector_indexes = [
        index for index in REQUIRED_INDEXES
        if index.kind == "vectorSearch"
    ]

    assert vector_indexes
    for index in vector_indexes:
        vector_fields = [
            field for field in index.definition["fields"]
            if field["type"] == "vector"
        ]
        assert vector_fields
        assert vector_fields[0]["path"] == "embedding"
        assert vector_fields[0]["numDimensions"] == 1024


def test_default_env_values_match_golden_retrieval_defaults(monkeypatch):
    monkeypatch.delenv("GOLDEN_MONGODB_DATABASE", raising=False)
    monkeypatch.delenv("GOLDEN_MONGODB_INDEX", raising=False)
    monkeypatch.delenv("GOLDEN_MONGODB_ANSWERS_INDEX", raising=False)
    monkeypatch.delenv("GOLDEN_MONGODB_SEARCH_INDEX", raising=False)

    values = golden_index_env_values()

    assert values["GOLDEN_MONGODB_DATABASE"] == "agriai"
    assert values["GOLDEN_MONGODB_INDEX"] == QUESTION_VECTOR_INDEX
    assert values["GOLDEN_MONGODB_ANSWERS_INDEX"] == ANSWER_VECTOR_INDEX
    assert values["GOLDEN_MONGODB_SEARCH_INDEX"] == QUESTION_TEXT_INDEX
