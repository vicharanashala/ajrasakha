from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import re
from typing import Dict, List, Set, Tuple
import xml.etree.ElementTree as ET
import zipfile

from models import ContextPOP, RestrictedChemicalFlag


_XML_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_WORD_BOUNDARY = r"(^|[^a-z0-9]){token}([^a-z0-9]|$)"


@dataclass(frozen=True)
class ChemicalPolicy:
    chemical_id: str
    chemical_name: str
    status: str
    allowed_usage: str
    restriction_text: str


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _safe_text(value: str) -> str:
    return str(value or "").strip()


def _normalize_chemical_id(value: str) -> str:
    text = _safe_text(value)
    # Excel numeric IDs sometimes appear as "83.0"; canonicalize to "83".
    if re.fullmatch(r"\d+\.0+", text):
        return text.split(".", 1)[0]
    return text


def _column_index(cell_ref: str) -> int:
    letters = "".join(character for character in cell_ref if character.isalpha()).upper()
    index = 0
    for character in letters:
        index = index * 26 + (ord(character) - ord("A") + 1)
    return max(index - 1, 0)


def _read_sheet_rows(path: Path) -> List[List[str]]:
    with zipfile.ZipFile(path) as workbook:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared_root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("a:si", _XML_NS):
                shared_strings.append(
                    "".join((token.text or "") for token in item.findall(".//a:t", _XML_NS))
                )

        root = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))

    rows: List[List[str]] = []
    for row in root.findall(".//a:sheetData/a:row", _XML_NS):
        values_by_index: Dict[int, str] = {}
        for cell in row.findall("a:c", _XML_NS):
            cell_type = cell.attrib.get("t")
            index = _column_index(cell.attrib.get("r", "A1"))

            if cell_type == "s":
                value_node = cell.find("a:v", _XML_NS)
                if value_node is not None and value_node.text is not None:
                    values_by_index[index] = shared_strings[int(value_node.text)]
                else:
                    values_by_index[index] = ""
                continue

            if cell_type == "inlineStr":
                values_by_index[index] = (
                    "".join((token.text or "") for token in cell.findall(".//a:t", _XML_NS))
                )
                continue

            value_node = cell.find("a:v", _XML_NS)
            values_by_index[index] = (
                value_node.text if value_node is not None and value_node.text else ""
            )
        max_index = max(values_by_index.keys(), default=-1)
        values = [values_by_index.get(i, "") for i in range(max_index + 1)]
        rows.append(values)
    return rows


@lru_cache(maxsize=1)
def _build_lookup() -> Tuple[Dict[str, Set[str]], Dict[str, ChemicalPolicy]]:
    base_path = Path(__file__).resolve().parent
    alias_path = base_path / "data" / "chemical_name_alias.xlsx"
    banned_path = base_path / "data" / "banned_chemicals.xlsx"

    alias_rows = _read_sheet_rows(alias_path)
    banned_rows = _read_sheet_rows(banned_path)

    alias_to_ids: Dict[str, Set[str]] = {}
    policies_by_id: Dict[str, ChemicalPolicy] = {}

    for row in banned_rows[1:]:
        if len(row) < 3:
            continue
        chemical_id = _normalize_chemical_id(row[0])
        chemical_name = _safe_text(row[1])
        status = _safe_text(row[2])
        allowed_usage = _safe_text(row[4]) if len(row) > 4 else ""
        restriction_text = _safe_text(row[8]) if len(row) > 8 else ""

        if not chemical_id:
            continue

        policies_by_id[chemical_id] = ChemicalPolicy(
            chemical_id=chemical_id,
            chemical_name=chemical_name,
            status=status,
            allowed_usage=allowed_usage,
            restriction_text=restriction_text,
        )

    for row in alias_rows[1:]:
        if len(row) < 3:
            continue
        chemical_id = _normalize_chemical_id(row[0])
        chemical_name = _safe_text(row[1])
        alias = _safe_text(row[2])

        if not chemical_id:
            continue

        for token in (alias, chemical_name):
            normalized = _normalize(token)
            if not normalized:
                continue
            alias_to_ids.setdefault(normalized, set()).add(chemical_id)

    return alias_to_ids, policies_by_id


def _find_policy_matches(text: str) -> Dict[str, ChemicalPolicy]:
    alias_to_ids, policies_by_id = _build_lookup()
    lowered_text = _normalize(text)
    matched: Dict[str, ChemicalPolicy] = {}

    for alias, chemical_ids in alias_to_ids.items():
        pattern = _WORD_BOUNDARY.format(token=re.escape(alias))
        if not re.search(pattern, lowered_text, flags=re.IGNORECASE):
            continue

        for chemical_id in sorted(chemical_ids):
            policy = policies_by_id.get(chemical_id)
            if policy:
                matched[chemical_id] = policy

    return matched


def _compliance_from_matched_policies(
    matched_policies: Dict[str, ChemicalPolicy],
) -> Tuple[Dict[str, RestrictedChemicalFlag], Set[str], bool]:
    """Classify matched policies into restricted flags, blocked (banned) names, and whether any non-restricted match exists."""
    restricted_flags: Dict[str, RestrictedChemicalFlag] = {}
    blocked_chemical_names: Set[str] = set()
    has_blocked_match = False
    for policy in matched_policies.values():
        if _normalize(policy.status) != "restricted":
            has_blocked_match = True
            if policy.chemical_name:
                blocked_chemical_names.add(policy.chemical_name)
            continue

        restricted_flags[policy.chemical_id] = RestrictedChemicalFlag(
            chemical_id=policy.chemical_id,
            chemical_name=policy.chemical_name,
            allowed_usage=policy.allowed_usage,
            restriction_text=policy.restriction_text,
        )

    return restricted_flags, blocked_chemical_names, has_blocked_match


def analyze_text_for_chemical_compliance(
    text: str,
) -> Tuple[List[RestrictedChemicalFlag], List[str]]:
    """
    Apply the same chemical policy rules as retrieved POP context, but to arbitrary text (e.g. the user query).
    """
    matched = _find_policy_matches(text)
    if not matched:
        return [], []
    restricted, blocked, _ = _compliance_from_matched_policies(matched)
    return (
        sorted(restricted.values(), key=lambda flag: flag.chemical_name.lower()),
        sorted(blocked, key=str.lower),
    )


def filter_pop_contexts_for_chemical_compliance(
    contexts: List[ContextPOP],
) -> Tuple[List[ContextPOP], List[RestrictedChemicalFlag], List[str]]:
    filtered_contexts: List[ContextPOP] = []
    restricted_flags: Dict[str, RestrictedChemicalFlag] = {}
    blocked_chemical_names: Set[str] = set()

    for context in contexts:
        matched_policies = _find_policy_matches(context.text)
        if not matched_policies:
            filtered_contexts.append(context)
            continue

        ctx_restricted, ctx_blocked, has_blocked_match = _compliance_from_matched_policies(
            matched_policies
        )
        restricted_flags.update(ctx_restricted)
        blocked_chemical_names.update(ctx_blocked)

        if not has_blocked_match:
            filtered_contexts.append(context)

    return (
        filtered_contexts,
        sorted(restricted_flags.values(), key=lambda flag: flag.chemical_name.lower()),
        sorted(blocked_chemical_names, key=str.lower),
    )
