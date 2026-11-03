import pytest

from assistant import operations, structural_validator


@pytest.fixture(autouse=True)
def _clear_determinism_caches():
    """validate_structure_cached/polish_draft_cached (Revision 17,
    ISS-04/11) persist across test functions within one pytest process -
    without clearing them, two tests using the same input text with
    different mocked behavior could leak a stale cached result between
    them."""
    structural_validator.validate_structure_cached.cache_clear()
    operations.polish_draft_cached.cache_clear()
    yield
