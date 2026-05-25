from ajrasakha.evaluation.deepeval_metrics import (
    evaluate_answer_with_deepeval,
)


def evaluate_response_quality(result: dict) -> dict:

    #response_text = str(result.get("response", ""))
    response_text = str(result.get("response_text", ""))

    query = str(result.get("query", ""))

    context = []

    trace = str(result.get("trace", ""))

    if "gdb" in trace.lower():
        context.append(trace)

    deepeval_result = evaluate_answer_with_deepeval(
        query=query,
        answer=response_text,
        context=context,
    )

    flat = {}

    for metric_name, metric_data in deepeval_result.items():

        prefix = metric_name.lower()

        flat[f"{prefix}_score"] = metric_data.get("score")

        flat[f"{prefix}_passed"] = metric_data.get("passed")

        flat[f"{prefix}_reason"] = metric_data.get("reason")

    return flat 