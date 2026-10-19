import sys
from pathlib import Path

# make `import main` work no matter where pytest is launched from
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def pytest_configure(config):
    config.addinivalue_line("markers", "live: hits real MongoDB + Anthropic (costs API calls)")
