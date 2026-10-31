"""A small cache that only stores a result when it's definitive - never
when it represents "we couldn't tell this time" (e.g. a transient LLM
timeout). Caching a transient failure would permanently stick that one
request with a bad answer until the next restart, trading one kind of
inconsistency (the original "same input, different answers" complaint)
for a worse one. Confirmed necessary live: a real re-test report hit
several genuine upstream timeouts after the first caching pass shipped,
each of which would have been cached forever (Writing Assistant Build
Plan, Revision 18, continuation of ISS-04/ISS-11).

A plain functools.lru_cache can't express this - it caches whatever the
wrapped function returns, unconditionally.
"""

import threading
from typing import Callable, TypeVar

T = TypeVar("T")


class ResultCache:
    def __init__(self, maxsize: int = 512):
        self._store: dict[object, T] = {}
        self._lock = threading.Lock()
        self._maxsize = maxsize

    def get_or_compute(self, key: object, compute: Callable[[], T], is_definitive: Callable[[T], bool]) -> T:
        with self._lock:
            if key in self._store:
                return self._store[key]
        result = compute()
        if is_definitive(result):
            with self._lock:
                if len(self._store) >= self._maxsize:
                    self._store.pop(next(iter(self._store)))  # crude FIFO eviction, not true LRU - fine at this scale
                self._store[key] = result
        return result

    def cache_clear(self) -> None:
        with self._lock:
            self._store.clear()
