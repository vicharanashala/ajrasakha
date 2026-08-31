---
license: mit
---

# Ajrasakha Dataset v1

A question–answer dataset of Indian agriculture advisory queries and expert-reviewed answers, primarily in English with occasional local-language terms and English/local-language code-mixing (e.g. Hindi, Marathi, Telugu, Tamil, Punjabi, Bengali script borrowed words). Built from the production data of Ajrasakha, an AI-assisted agricultural advisory platform by annam.ai.

## At a glance

| | |
|---|---|
| **Source** | annam.ai — Ajrasakha platform |
| **Coverage** | Up to {{SYNC_DATE}} |
| **Total Records** | {{TOTAL_RECORDS}} |
| **Languages** | Primarily English; with local-language terms and English/local-language code-mixing (Hindi, Marathi, Telugu, Tamil, Punjabi, Bengali, etc.) |
| **Domain** | Agriculture (crop protection, nutrients, agronomy, varieties, market info, weather, horticulture) |
| **License** | MIT |
| **Splits** | train ({{TRAIN_COUNT}}) / validation ({{VAL_COUNT}}) / test ({{TEST_COUNT}}) |

## Schema

Each row is one question. The question and its best (final / approved) answer are denormalised into a single record.

| Column | Type | Coverage | Description |
|---|---|---|---|
| `question_id` | string | 100% | Ajrasakha question identifier |
| `question` | string | 100% | The question text |
| `priority` | string | 100% | high, critical, or medium |
| `source` | string | 100% | Ingestion channel: AGRI_EXPERT, AJRASAKHA, MANUAL, WHATSAPP, OUTREACH |
| `state` | string | 100% | Indian state declared by the farmer |
| `district` | string | 100% | District declared by the farmer |
| `crop` | string | 100% | Crop as declared by the farmer (raw, may have casing variants) |
| `normalised_crop` | string | 100% | Crop normalised to a canonical value |
| `season` | string | 100% | Kharif, Rabi, Zaid, Perennial, General, etc. |
| `domain` | string | 100% | Advisory domain: Plant Protection, Pest, Disease, Fertilizer and Nutrient, Agronomy, Variety, Horticulture, Market Information, Weather, etc. |
| `user_id` | string | 73% | Opaque identifier of the farmer who asked |
| `question_created_at` | string | 100% | ISO 8601 timestamp |
| `final_answer_id` | string | 92% | Identifier of the chosen answer |
| `final_answer` | string | 92% | The answer text |
| `final_answer_approval_count` | float | 92% | Number of approvals the answer received |
| `final_answer_author_id` | string | 90% | Opaque identifier of the expert who drafted the answer |
| `final_answer_approved_by` | string | 82% | Opaque identifier of the reviewer who approved it |
| `final_answer_sources` | string | 92% | JSON array of citation objects: {source, sourceType, page, sourceName} |

Rows without a final answer were either closed as duplicates, not approved, or non-agricultural.

## Answer selection

For each unique question, the best available answer is chosen in this order:

1. `isFinalAnswer = true` AND `status = approved`
2. Any `status = approved` answer (highest `approvalCount` first)
3. Highest `approvalCount` regardless of status

The non-embedded fields `final_answer_sources` and `final_answer` are the model's outputs from the underlying pipeline; internal-only fields (moderator routing, review timelines, embeddings, internal file paths) are not included in this release.

## Sources / citations

Each answer is grounded in agricultural reference material — primarily state Packages of Practices (POP), ICAR / NIPHM / IPM guidelines, and government scheme documents. Citations are preserved as JSON in `final_answer_sources`. Each entry has:

- `source` — public URL to the document
- `sourceType` — central (Indian government) or state
- `page` — page number in the source PDF
- `sourceName` — human-readable document title

## Use cases

- Fine-tuning agricultural question-answering models for Indian English with local-language code-mixing
- Retrieval-augmented generation (RAG) over Package-of-Practices style documents
- Evaluation of factual grounding in low-resource, multilingual agricultural domains
- Studying farmer query patterns and crop-distribution across Indian states

## Limitations

- Coding and priority are platform-specific and may not generalise
- Question and answer quality varies with the underlying expert process
- Some crops are repeated with inconsistent casing in the raw `crop` field; use `normalised_crop` for statistics
- Identifier columns (`user_id`, `final_answer_author_id`, `final_answer_approved_by`) are opaque — they cannot be resolved to public profiles and are not suitable for individual-level analysis
- The dataset reflects the production distribution of farmer queries and is not a balanced sample

## Citation

If you use this dataset in research or product work, please cite:

Ajrasakha Dataset v1. annam.ai. 2026. https://huggingface.co/datasets/vicharanashala/ajrasakha-dataset-v1

## License

Released under the MIT License. You are free to use, modify, and distribute, including for commercial purposes, subject to the standard MIT terms.

## About

Maintained by annam.ai — an AI platform for Indian agriculture that connects farmers with verified, source-grounded agricultural advice.