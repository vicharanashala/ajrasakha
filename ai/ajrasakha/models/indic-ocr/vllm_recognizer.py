"""vLLM backend for IndicOCR.

The bodhan-ai/indic-ocr Hub package only ships ``HfRecognizer`` (plain transformers). Its docs
mention a ``VllmRecognizer`` but the class is not in the package, so it lives here. It implements
the package's ``RecognizerBackend`` protocol and plugs into the public ``IndicBlockOCR`` stage.

All engine settings come from the package's ``RecognizerConfig``. The prompt is built the same way
as in ``HfRecognizer``.
"""

from __future__ import annotations

import os
from pathlib import Path

from idp_offline import IndicBlockOCR, IndicDocLayout
from idp_recognizer import CropRequest
from idp_types import RecognizerConfig


class VllmRecognizer:
    """``transcribe`` returns one string per request, in the same order."""

    def __init__(self, ckpt: str, config: RecognizerConfig) -> None:
        from transformers import AutoProcessor
        from vllm import LLM, SamplingParams

        self.config = config
        self._processor = AutoProcessor.from_pretrained(ckpt)
        self._sampling = SamplingParams(
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )
        self._llm = LLM(
            model=ckpt,
            dtype=config.dtype,
            max_model_len=config.max_model_len,
            gpu_memory_utilization=config.gpu_memory_utilization,
            enforce_eager=config.enforce_eager,
            limit_mm_per_prompt={"image": 1},
        )

    def _prompt(self, text: str) -> str:
        return self._processor.apply_chat_template(
            [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": text}]}],
            add_generation_prompt=True,
            tokenize=False,
        )

    def transcribe(self, requests: list[CropRequest]) -> list[str]:
        texts: list[str] = []
        for i in range(0, len(requests), self.config.batch_size):
            chunk = requests[i : i + self.config.batch_size]
            outputs = self._llm.generate(
                [
                    {"prompt": self._prompt(r.prompt), "multi_modal_data": {"image": r.image}}
                    for r in chunk
                ],
                self._sampling,
                use_tqdm=False,
            )
            texts.extend(output.outputs[0].text.strip() for output in outputs)
        return texts

    def close(self) -> None:
        self._llm = None
        self._processor = None


class VllmIndicOCR:
    """Both IndicOCR stages, with the vLLM recognizer in place of ``HfRecognizer``."""

    def __init__(self, repo_path: str | Path) -> None:
        weights = Path(repo_path) / "weights"
        utilization = os.environ.get("VLLM_GPU_MEMORY_UTILIZATION")
        config = RecognizerConfig().merged(
            gpu_memory_utilization=float(utilization) if utilization else None
        )

        # vLLM first: its engine process has to initialise CUDA before the torch layout model
        # touches the device in this process (same ordering as the package's idp_offline.IndicOCR).
        self.ocr = IndicBlockOCR(
            backend=VllmRecognizer(str(weights / "ocr"), config),
            config=config,
        )
        self.layout = IndicDocLayout(str(weights / "layout"))

    def parse(self, image_path: str) -> dict:
        """``{image, width, height, blocks, markdown}``, same shape as ``IndicOCR.parse``."""
        page = self.ocr.run(image_path, self.layout.detect(image_path))
        return {**page.as_record(), "markdown": page.markdown}
