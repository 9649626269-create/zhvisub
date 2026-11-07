"""Progress tracking for pipeline steps."""

from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass
class StepWeight:
    """Weight configuration for progress calculation."""
    ingest: float = 0.05
    asr: float = 0.25
    ocr: float = 0.15
    translate: float = 0.15
    dub: float = 0.15
    render: float = 0.25

    def without_dub(self) -> "StepWeight":
        """Redistribute dub weight when dubbing is disabled."""
        # Redistribute 0.15 proportionally among other steps
        factor = 1.0 / (1.0 - self.dub)
        return StepWeight(
            ingest=self.ingest * factor,
            asr=self.asr * factor,
            ocr=self.ocr * factor,
            translate=self.translate * factor,
            dub=0.0,
            render=self.render * factor,
        )


STEP_NAMES = {
    "ingest": "Nhận video",
    "extract_audio": "Tách audio",
    "asr": "Nhận diện giọng nói",
    "ocr": "Phát hiện phụ đề cứng",
    "translate": "Dịch phụ đề",
    "dub": "Lồng tiếng",
    "render": "Render video",
    "done": "Hoàn thành",
}


@dataclass
class ProgressTracker:
    """Track and report pipeline progress."""
    callback: Optional[Callable[[str, float, str], None]] = None
    weights: StepWeight = field(default_factory=StepWeight)
    _current_step: str = ""
    _step_progress: float = 0.0
    _completed_weight: float = 0.0

    # Ordered step list for weight accumulation
    _step_order: list[str] = field(
        default_factory=lambda: ["ingest", "asr", "ocr", "translate", "dub", "render"]
    )

    def _get_weight(self, step: str) -> float:
        return getattr(self.weights, step, 0.0)

    def start_step(self, step: str, log: str = "") -> None:
        """Begin a new pipeline step."""
        if self._current_step and self._current_step != step:
            # Mark previous step as complete
            self._completed_weight += self._get_weight(self._current_step)
        self._current_step = step
        self._step_progress = 0.0
        display = STEP_NAMES.get(step, step)
        msg = f"{display}: {log}" if log else display
        self._report(msg)

    def update(self, fraction: float, log: str = "") -> None:
        """Update progress within current step (0.0 to 1.0)."""
        self._step_progress = min(max(fraction, 0.0), 1.0)
        display = STEP_NAMES.get(self._current_step, self._current_step)
        msg = f"{display}: {log}" if log else display
        self._report(msg)

    def finish(self, log: str = "Hoàn thành") -> None:
        """Mark the entire pipeline as done."""
        if self._current_step:
            self._completed_weight += self._get_weight(self._current_step)
        self._current_step = "done"
        self._step_progress = 1.0
        if self.callback:
            self.callback("done", 1.0, log)

    def _report(self, msg: str) -> None:
        step_weight = self._get_weight(self._current_step)
        total = self._completed_weight + step_weight * self._step_progress
        total = min(total, 0.99)  # Reserve 1.0 for finish()
        if self.callback:
            self.callback(self._current_step, total, msg)

    @property
    def overall_progress(self) -> float:
        step_weight = self._get_weight(self._current_step)
        return min(self._completed_weight + step_weight * self._step_progress, 1.0)
