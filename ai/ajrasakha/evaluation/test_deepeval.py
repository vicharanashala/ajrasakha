from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

query = "How to grow paddy in Punjab?"

answer = """
Paddy in Punjab is usually grown during the kharif season.
Farmers should prepare puddled fields, use suitable rice varieties,
transplant seedlings, maintain irrigation, and manage weeds and pests carefully.
"""

context = [
    "Paddy is a kharif crop grown in Punjab. It requires nursery raising, puddled field preparation, transplanting, irrigation, weed control, and pest management."
]

result = evaluate_answer_with_deepeval(
    query=query,
    answer=answer,
    retrieval_context=context,
)

print(result)
