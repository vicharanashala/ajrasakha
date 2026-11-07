import sys; from pathlib import Path; _ROOT = Path(__file__).resolve().parent.parent.parent; sys.path.insert(0, str(_ROOT)) if str(_ROOT) not in sys.path else None
