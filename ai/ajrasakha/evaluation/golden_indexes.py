"""CLI for Golden DB Atlas Search index readiness and creation."""

from __future__ import annotations

import argparse
import json

from ajrasakha.evaluation.golden_index_setup import (
    create_required_search_indexes,
    golden_index_readiness,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--create",
        action="store_true",
        help="Create missing Golden DB Atlas Search indexes.",
    )
    args = parser.parse_args()

    result = create_required_search_indexes() if args.create else golden_index_readiness()
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
