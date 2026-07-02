"""Tests for crop_chemical_resolver (mock cache, no live Mongo)."""

from ajrasakha.agents import crop_chemical_resolver as resolver


def _sample_docs() -> list[dict]:
    return [
        {
            "_id": "crop1",
            "name": "Brinjal",
            "type": "crop",
            "aliases": [
                {
                    "language": "Malayalam",
                    "region": "Kerala",
                    "english_representation": "vazhuthana",
                    "native_representation": "വഴുതന",
                },
                {
                    "language": "Hindi",
                    "region": "Himachal Pradesh",
                    "english_representation": "baingan",
                    "native_representation": "बैंगन",
                },
            ],
        },
        {
            "_id": "crop2",
            "name": "Wheat",
            "type": "crop",
            "aliases": [
                {
                    "language": "Hindi",
                    "region": "Himachal Pradesh",
                    "english_representation": "gehun",
                    "native_representation": "गेहूं",
                },
                {
                    "language": "Telugu",
                    "region": "Telangana",
                    "english_representation": "godhuma",
                    "native_representation": "గోధుమ",
                },
            ],
        },
        {
            "_id": "chem1",
            "name": "Monocrotophos",
            "type": "chemical",
            "aliases": [],
        },
        {
            "_id": "sentinel1",
            "name": "All",
            "type": "crop",
            "aliases": [],
        },
    ]


def setup_function() -> None:
    resolver.build_cache_from_docs(_sample_docs())


def test_detect_dominant_script_devanagari():
    assert resolver.detect_dominant_script("महाराष्ट्र") == "devanagari"


def test_detect_dominant_script_latin():
    assert resolver.detect_dominant_script("Maharashtra") == "latin"


def test_segment_by_script_mixed():
    segments = resolver.segment_by_script("गेहूं crop disease")
    assert len(segments) == 2
    assert segments[0][1] == "devanagari"
    assert "गेहूं" in segments[0][0]
    assert segments[1][1] == "latin"
    assert "crop" in segments[1][0]


def test_resolve_alias_exact_latin():
    hit = resolver.resolve_alias_exact("vazhuthana")
    assert hit is not None
    assert hit.entry.name == "Brinjal"
    assert hit.script == "latin"
    assert hit.match_type == "exact"


def test_resolve_alias_exact_devanagari():
    hit = resolver.resolve_alias_exact("गेहूं")
    assert hit is not None
    assert hit.entry.name == "Wheat"
    assert hit.script == "devanagari"


def test_find_crop_fuzzy_latin():
    matches = resolver.find_crop_fuzzy_matches("my vazhuthana plant has pests")
    assert matches
    assert matches[0].entry.name == "Brinjal"
    assert matches[0].script == "latin"
    assert matches[0].score > 80


def test_find_crop_fuzzy_devanagari():
    matches = resolver.find_crop_fuzzy_matches("गेहूं में रोग")
    assert matches
    assert matches[0].entry.name == "Wheat"
    assert matches[0].script == "devanagari"
    assert matches[0].score > 80


def test_devanagari_does_not_match_telugu_alias():
    matches = resolver.find_crop_fuzzy_matches("గోధుమ")
    assert matches
    assert matches[0].entry.name == "Wheat"
    assert matches[0].script == "telugu"

    devanagari_matches = resolver.find_crop_fuzzy_matches("गेहूं")
    assert all(m.script == "devanagari" for m in devanagari_matches)


def test_chemical_included_in_fuzzy_matches():
    resolver.build_cache_from_docs([
        {
            "_id": "chem1",
            "name": "Monocrotophos",
            "type": "chemical",
            "aliases": [{"english_representation": "monocil", "native_representation": ""}],
        },
    ])
    matches = resolver.find_crop_fuzzy_matches("how to use monocil spray")
    assert matches
    assert matches[0].entry.name == "Monocrotophos"
    assert matches[0].entry.type == "chemical"


def test_chemical_typo_mylonee_matches_mylone():
    resolver.build_cache_from_docs([
        {
            "_id": "chem2",
            "name": "Dazomet",
            "type": "chemical",
            "aliases": [{"english_representation": "mylone", "native_representation": ""}],
        },
    ])
    matches = resolver.find_crop_fuzzy_matches("how to use        mylonee")
    assert matches
    assert matches[0].entry.name == "Dazomet"
    assert matches[0].alias == "mylone"


def test_word_boundary_rice_in_red_rice():
    resolver.build_cache_from_docs([
        {
            "_id": "crop5",
            "name": "Rice",
            "type": "crop",
            "aliases": [{"english_representation": "red rice", "native_representation": ""}],
        },
    ])
    matches = resolver.find_crop_fuzzy_matches("price of rice today")
    assert matches
    assert matches[0].entry.name == "Rice"
    assert matches[0].score == 100


def test_redrice_does_not_match_red_rice_alias():
    resolver.build_cache_from_docs([
        {
            "_id": "crop5",
            "name": "Rice",
            "type": "crop",
            "aliases": [{"english_representation": "red rice", "native_representation": ""}],
        },
    ])
    matches = resolver.find_crop_fuzzy_matches("redrice pests")
    assert all(m.entry.name != "Rice" for m in matches)


def test_alias_match_score_word_boundary_vs_ratio():
    assert resolver._alias_match_score("rice", "red rice") == 100
    assert resolver._alias_match_score("rice", "redrice") < 80
    assert resolver._alias_match_score("mylonee", "mylone") > 80


def test_latin_token_match_avoids_use_us_false_positive():
    resolver.build_cache_from_docs([
        {
            "_id": "crop4",
            "name": "Sugarcane",
            "type": "crop",
            "aliases": [{"english_representation": "us", "native_representation": ""}],
        },
    ])
    matches = resolver.find_crop_fuzzy_matches("how to use mylonee")
    assert all(m.entry.name != "Sugarcane" for m in matches)


def test_sentinel_crop_excluded_from_fuzzy_index():
    matches = resolver.find_crop_fuzzy_matches("all crops question")
    names = {m.entry.name for m in matches}
    assert "All" not in names


def test_format_planner_crop_hints():
    text = resolver.format_planner_crop_hints("vazhuthana pests in Kerala")
    assert "CROP/CHEMICAL ALIAS HINTS" in text
    assert "Brinjal" in text
    assert "[latin]" in text


def test_comma_split_aliases_indexed():
    resolver.build_cache_from_docs([
        {
            "_id": "crop3",
            "name": "Amaranth",
            "type": "crop",
            "aliases": [
                {
                    "english_representation": "cheera, chaulai",
                    "native_representation": "",
                },
            ],
        },
    ])
    assert resolver.resolve_alias_exact("cheera") is not None
    assert resolver.resolve_alias_exact("chaulai") is not None


def test_below_threshold_returns_empty():
    matches = resolver.find_crop_fuzzy_matches("xyzabc nonsense cropname")
    assert matches == []


def test_dictionary_roundtrip(tmp_path):
    docs = _sample_docs()
    payload = resolver.build_dictionary_from_docs(docs, source="test")
    py_file = tmp_path / "crop_chemical_name.py"
    resolver.write_crop_chemical_name_module(payload, py_file)
    content = py_file.read_text(encoding="utf-8")
    assert "crop_chemical_name" in content
    ns: dict = {}
    exec(content, ns)
    resolver.build_cache_from_dictionary(ns["crop_chemical_name"])
    assert resolver.resolve_alias_exact("vazhuthana") is not None
    assert resolver.resolve_alias_exact("vazhuthana").entry.name == "Brinjal"
    assert ns["crop_chemical_name"]["entry_count"] == len(docs)
