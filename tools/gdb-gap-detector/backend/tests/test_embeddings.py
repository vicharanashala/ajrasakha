import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from unittest.mock import patch, MagicMock
from app.embeddings import compute_embeddings


class TestComputeEmbeddings:
    def test_empty_input_returns_empty_list_without_loading_model(self):
        with patch("app.embeddings.get_model") as mock_get_model:
            result = compute_embeddings([])
            assert result == []
            mock_get_model.assert_not_called()  # no point loading the model for nothing

    def test_calls_model_encode_and_converts_to_plain_lists(self):
        fake_model = MagicMock()
        # Simulate what sentence-transformers actually returns: a numpy
        # array per input text, which has a .tolist() method.
        fake_vector_1 = MagicMock()
        fake_vector_1.tolist.return_value = [0.1, 0.2, 0.3]
        fake_vector_2 = MagicMock()
        fake_vector_2.tolist.return_value = [0.4, 0.5, 0.6]
        fake_model.encode.return_value = [fake_vector_1, fake_vector_2]

        with patch("app.embeddings.get_model", return_value=fake_model):
            result = compute_embeddings(["question one", "question two"])

        fake_model.encode.assert_called_once_with(
            ["question one", "question two"], show_progress_bar=False
        )
        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    def test_result_length_matches_input_length(self):
        fake_model = MagicMock()
        fake_vectors = [MagicMock(tolist=MagicMock(return_value=[i, i])) for i in range(5)]
        fake_model.encode.return_value = fake_vectors

        with patch("app.embeddings.get_model", return_value=fake_model):
            result = compute_embeddings([f"q{i}" for i in range(5)])

        assert len(result) == 5
