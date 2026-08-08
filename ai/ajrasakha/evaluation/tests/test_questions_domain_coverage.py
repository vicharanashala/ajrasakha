"""
FIX 2 / FIX 3: the brief's 6 domains (Weather, Market, Soil, Schemes,
"GDB queries", Greetings) must be exactly what questions.py's expected_domain
uses for real domain-quality cases, and each must have at least one stable:
True case - guards against a future edit silently reintroducing split labels
(e.g. "Market Prices" vs "Market") or losing stable coverage for a domain.
"""

from ajrasakha.evaluation.questions import TEST_CASES

BRIEF_DOMAINS = {"Weather", "Market", "Soil", "Schemes", "GDB queries", "Greetings"}

# Functional test categories, not domain-quality cases - see the comment
# above TEST_CASES in questions.py for why these are intentionally excluded.
NON_DOMAIN_CATEGORIES = {"General", "Plant Protection"}


def test_every_brief_domain_is_used_by_at_least_one_case():
    used_domains = {case["expected_domain"] for case in TEST_CASES}
    assert BRIEF_DOMAINS.issubset(used_domains)


def test_no_split_or_mismatched_domain_labels_outside_the_brief_and_known_categories():
    used_domains = {case["expected_domain"] for case in TEST_CASES}
    unexpected = used_domains - BRIEF_DOMAINS - NON_DOMAIN_CATEGORIES
    assert unexpected == set()


def test_every_brief_domain_has_at_least_one_stable_case():
    stable_domains = {
        case["expected_domain"] for case in TEST_CASES if case.get("stable") is True
    }
    missing = BRIEF_DOMAINS - stable_domains
    assert missing == set(), f"Domains with no stable:True case: {missing}"
