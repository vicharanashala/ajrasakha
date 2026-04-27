import json
from bs4 import BeautifulSoup

def parse_mandi_html(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract date and market name from the header row
    header_cell = soup.find("td", attrs={"colspan": "8"})
    header_text = header_cell.get_text(strip=True) if header_cell else ""

    # Extract all data rows (skip header rows — only rows with 8 tds)
    rows = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) == 8:
            def cell(i):
                val = tds[i].get_text(strip=True).rstrip(".")
                return None if val == "-" else val

            rows.append({
                "sno":         cell(0),
                "commodity":   cell(1),
                "variety":     cell(2),
                "arrival":     cell(3),
                "unit":        cell(4),
                "max_price":   cell(5),
                "modal_price": cell(6),
                "min_price":   cell(7),
            })

    result = {
        "header": header_text,
        "count":  len(rows),
        "data":   rows
    }

    return json.dumps(result, ensure_ascii=False, indent=2)