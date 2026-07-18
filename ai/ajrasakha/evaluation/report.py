import csv
from pathlib import Path


def write_csv_report(results: list[dict], output_file: str = "evaluation_report.csv"):
    if not results:
        print("No results to write.")
        return

    output_path = Path(output_file)

    fieldnames = []
    for result in results:
        for key in result.keys():
            if key not in fieldnames:
                fieldnames.append(key)

    with open(output_path, mode="w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(results)

    print(f"Report written to: {output_path.resolve()}")
