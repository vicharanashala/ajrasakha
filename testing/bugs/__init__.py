"""
testing/bugs
------------
Bug regression harnesses for the two known issues recorded in the roadmap:
* Bug-1195: closed-report data mismatch
  PR #1195, fixed by commit `cc44cc371`. The bug: the report endpoint
  returned different docs depending on whether the caller asked for
  `allUsers` vs `moderator`, even though the underlying question-set
  was identical. The repro inserts known questions and asserts that the
  field set matches across both flags.
* Bug-1204: crop-alias generic names
  PR #1204, fixed by commit `b2d86022a`. The bug: the bulk-pae-allocate
  path was persisting alias records under the generic name `unknown`
  instead of the real crop. The repro seeds two distinct crop-aliases,
  exercises the bulk-pae-allocate flow, and asserts that the persisted
  alias record carries the real crop name.

Each harness writes a `*.csv` row to stdout that the executor can pipe
into `results/bugs/repro_summary.csv`.
"""
