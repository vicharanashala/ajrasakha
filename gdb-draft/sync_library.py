"""Bring the library up to date with the POP server: fetch new translated DOCX, make PDFs.

Usage:
  python sync_library.py                 one pass over every state and crop
  python sync_library.py --every 30      repeat every 30 minutes until stopped
  python sync_library.py --state Odisha  one state only

For every translated DOCX on the POP server that is not on disk yet (or changed in size), it
downloads the file to data/pop_downloads/ and saves a PDF of it to data/anara_pdfs/, which is
what a reviewer opens from a citation. The draft service notices new files on the next
question, so nothing needs restarting. Run it where the draft service's data folder is.

The PDF is made with LibreOffice (soffice).
Needs POP_API_URL in .env (see pop_api_client.py).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv

from fetch_translated_docx import crops_in_state, fetch_batch
from library_files import DATA_DIRECTORY, PDF_DIRECTORY
from pop_api_client import PopApiClient

logger = logging.getLogger(__name__)

DOWNLOAD_DIRECTORY = DATA_DIRECTORY / "pop_downloads"
SOFFICE_TIMEOUT_SECONDS = 600

Converter = Callable[[Path, Path], None]


def pdf_name(docx_path: Path, root: Path) -> str:
    """<state>__<crop>__<file>.pdf for a file at <root>/<state>/<crop>/<document>/<file>.docx."""
    parts = docx_path.relative_to(root).parts
    name = f"{parts[0]}__{parts[1]}__{parts[-1]}" if len(parts) == 4 else parts[-1]
    return str(Path(name).with_suffix(".pdf"))


def soffice_converter() -> tuple[Converter, Callable[[], None]] | None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None

    def convert(docx_path: Path, pdf_path: Path) -> None:
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as scratch:
            source = Path(scratch) / "source.docx"
            shutil.copyfile(docx_path, source)
            subprocess.run(
                [soffice, f"-env:UserInstallation=file://{scratch}/profile", "--headless", "--convert-to", "pdf",
                 "--outdir", scratch, str(source)],
                check=True, timeout=SOFFICE_TIMEOUT_SECONDS, capture_output=True,
            )
            shutil.move(str(Path(scratch) / "source.pdf"), pdf_path)

    return convert, lambda: None


def make_pdfs(root: Path = DOWNLOAD_DIRECTORY, pdf_directory: Path = PDF_DIRECTORY,
              converter: tuple[Converter, Callable[[], None]] | None = None) -> tuple[int, list[str]]:
    """Save a PDF for each DOCX that has none, or whose PDF is older. Returns (made, failures)."""
    pending = [
        (docx, pdf_directory / pdf_name(docx, root))
        for docx in sorted(root.rglob("*.docx"))
        if not (pdf_directory / pdf_name(docx, root)).is_file()
        or (pdf_directory / pdf_name(docx, root)).stat().st_mtime < docx.stat().st_mtime
    ]
    if not pending:
        return 0, []
    engine = converter or soffice_converter()
    if engine is None:
        return 0, [f"{docx.name}: no Word or LibreOffice found to make a PDF" for docx, _ in pending]
    convert, close = engine
    made, failures = 0, []
    try:
        for docx, pdf in pending:
            try:
                convert(docx, pdf)
                made += 1
            except Exception as error:  # one bad file must not stop the rest
                failures.append(f"{docx.name}: {error}")
    finally:
        close()
    return made, failures


def prune(root: Path, keep: set[Path], states: list[str], pdf_directory: Path = PDF_DIRECTORY) -> list[Path]:
    """Delete downloaded DOCX (and their PDFs) that the server no longer lists, in these states.

    A copy under an old name would otherwise be searched twice. Only files under <root>/<state>
    are touched, and nothing is deleted unless the caller saw the whole listing without errors.
    """
    removed: list[Path] = []
    for state in states:
        for docx in sorted((root / state).rglob("*.docx")) if (root / state).is_dir() else []:
            if docx in keep:
                continue
            pdf = pdf_directory / pdf_name(docx, root)
            docx.unlink()
            if pdf.is_file():
                pdf.unlink()
            removed.append(docx)
        for folder in sorted((p for p in (root / state).rglob("*") if p.is_dir()), reverse=True):
            if not any(folder.iterdir()):
                folder.rmdir()
    return removed


def sync(client: PopApiClient, only_state: str | None = None) -> tuple[int, int, list[str]]:
    """One pass. Returns (documents on disk after the pass, PDFs made, problems)."""
    problems: list[str] = []
    kept: set[Path] = set()
    states = [only_state] if only_state else client.states()
    for state in states:
        try:
            for crop in crops_in_state(client, state):
                try:
                    kept.update(fetch_batch(client, state, crop, DOWNLOAD_DIRECTORY))
                except Exception as error:
                    problems.append(f"{state} / {crop}: {error}")
        except Exception as error:
            problems.append(f"{state}: {error}")
    if not problems:
        for removed in prune(DOWNLOAD_DIRECTORY, kept, states):
            print(f"  removed {removed.relative_to(DOWNLOAD_DIRECTORY)}")
    made, failures = make_pdfs()
    on_disk = sum(1 for _ in DOWNLOAD_DIRECTORY.rglob("*.docx")) if DOWNLOAD_DIRECTORY.is_dir() else 0
    return on_disk, made, problems + failures


def sync_forever(url: str, every_minutes: int) -> None:
    """Run sync() now and every `every_minutes`, for a background thread. Never raises."""
    while True:
        try:
            on_disk, made, problems = sync(PopApiClient(url))
            logger.info("library sync: %d documents, %d PDF(s) made", on_disk, made)
            for problem in problems:
                logger.warning("library sync problem: %s", problem)
        except Exception:
            logger.exception("library sync failed")
        time.sleep(every_minutes * 60)


def main(argv: list[str]) -> int:
    load_dotenv(Path(__file__).resolve().parent / ".env")
    if not os.getenv("POP_API_URL"):
        print("Missing setting in .env: POP_API_URL")
        return 1
    every = int(argv[argv.index("--every") + 1]) if "--every" in argv else None
    only_state = argv[argv.index("--state") + 1] if "--state" in argv else None
    client_url = os.environ["POP_API_URL"]
    while True:
        on_disk, made, problems = sync(PopApiClient(client_url), only_state)
        print(f"{time.strftime('%Y-%m-%d %H:%M')}  {on_disk} documents on disk, {made} PDF(s) made")
        for problem in problems:
            print(f"  problem: {problem}")
        if every is None:
            return 1 if problems else 0
        time.sleep(every * 60)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
