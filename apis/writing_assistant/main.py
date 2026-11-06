"""Writing Assistant: language-polishing + structural coverage checks for
an author's draft answer, called by the Node backend before the draft
enters the existing review workflow. Never mutates the draft itself.
"""

import logging
import uuid

from fastapi import FastAPI

from assistant import operations, reference_data, structural_validator
from assistant.models import PolishDraftRequest, PolishDraftResponse, StructuralValidationStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
log = logging.getLogger("writing_assistant")

app = FastAPI(title="Writing Assistant")


@app.post("/polish-draft", response_model=PolishDraftResponse)
def polish_draft_endpoint(request: PolishDraftRequest) -> PolishDraftResponse:
    warnings: list[str] = []

    dataset = reference_data.get_cached_dataset()
    if dataset is None:
        warnings.append("Reference dataset is not loaded - structural validation is unavailable.")

    # Structural validation runs first: team requirement is that a polish
    # suggestion is only offered once every expected step is covered, so an
    # incomplete draft skips the (slower) rewrite+guardrail call entirely
    # rather than computing and then discarding it.
    structural_result = structural_validator.validate_structure_cached(request.question, request.draft)

    if structural_result.status == StructuralValidationStatus.COMPLETE:
        language_result = operations.polish_draft_cached(request.draft)
    else:
        language_result = operations.skipped_due_to_incomplete_structure(structural_result)

    return PolishDraftResponse(
        request_id=str(uuid.uuid4()),
        language_polishing=language_result,
        structural_validation=structural_result,
        warnings=warnings,
        errors=[],
    )


@app.get("/health")
def health() -> dict:
    """Always returns 200 with a status field - a monitoring/deploy script
    can always parse this body rather than branching on HTTP status. Checked
    after every deploy, before the deploy counts as successful (Writing
    Assistant Build Plan, 'Production release consistency')."""
    dataset = reference_data.get_cached_dataset()
    if dataset is None:
        return {"status": "degraded", "referenceDataLoaded": False}
    return {
        "status": "ok",
        "referenceDataLoaded": True,
        "releaseId": dataset.release_id,
        "groupsLoaded": len(dataset.structures),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)
