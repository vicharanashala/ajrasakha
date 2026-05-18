import json
from bs4 import BeautifulSoup
import re
from datetime import datetime

def delhi_mandi_parser(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")
    
    text = ""
    for td in soup.find_all("td", attrs={"align": "center"}):
        if "as on" in td.get_text(strip=True):
            text = td.get_text(strip=True)
            break

    print("Full text:", text)

    # Extract date using regex
    match = re.search(r"as on (.+?)\)", text)
    if match:
        print("Match :", match)
        date_str = match.group(1)
        print("Extracted date:", date_str)
        dt = datetime.strptime(date_str, "%A, %B %d, %Y")
        formatted_date = dt.strftime("%d-%m-%Y")  # e.g. "25-04-2026"
    else:
        print("Match not found!")
        formatted_date = ""
    
    # Extract market name from the header
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
        "state": "Delhi",
        "date" : formatted_date,
        "item_count":  len(rows),
        "data":   rows
    }

    return json.dumps(result, ensure_ascii=False, indent=2)



def parse_mandi_html_karnataka(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")

    # ── Header: date and group ─────────────────────────────────────────────────
    date_span  = soup.find("span", id="_ctl0_MainContent_lbl_reportname")
    group_span = soup.find("span", id="_ctl0_MainContent_Lbl_Grp")

    date_text  = date_span.get_text(strip=True)  if date_span  else ""
    group_text = group_span.get_text(strip=True) if group_span else ""

    # Extract just the date e.g. "24/04/2026"
    date_match = re.search(r"\d{2}/\d{2}/\d{4}", date_text)
    date       = date_match.group(0) if date_match else date_text

    # Extract group name e.g. "Cereals"
    group_match = re.search(r"Group:\s*(\w[\w\s&]*?)\s+\(", group_text)
    group       = group_match.group(1).strip() if group_match else group_text

    # ── Data table: 9 <td> columns ────────────────────────────────────────────
    # Find the inner data table (has 9 <th> headers)
    data_table = None
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if headers == ["Commodity", "Variety", "Grade", "Market", "Arrival", "Unit", "Min", "Max", "Modal"]:
            data_table = table
            break

    rows = []
    if data_table:
        for tr in data_table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) == 9:
                def cell(i):
                    val = tds[i].get_text(strip=True)
                    return None if val in ("-", "") else val

                rows.append({
                    "sno":         len(rows) + 1,
                    "commodity":   cell(0),
                    "variety":     cell(1),
                    "grade":       cell(2),
                    "market":      cell(3),
                    "arrival":     cell(4),
                    "unit":        cell(5),
                    "min_price":   cell(6),
                    "max_price":   cell(7),
                    "modal_price": cell(8),
                })

    return json.dumps({
        "state":      "Karnataka",
        "date":       date,
        "item_count": len(rows),
        "data":       rows,
    }, ensure_ascii=False, indent=2)


def karnatak_state_daily(html_content: str) -> list[dict]:
    soup = BeautifulSoup(html_content, "html.parser")
    
    table = soup.find("table", style=lambda s: s and "660px" in s)
    
    headers = []
    rows = []
    
    for i, row in enumerate(table.find_all("tr")):
        cols = row.find_all(["th", "td"])
        values = [c.get_text(strip=True) for c in cols]
        if i == 0:
            headers = values
        else:
            rows.append(dict(zip(headers, values)))
    
    return rows