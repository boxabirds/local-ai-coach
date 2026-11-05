# The tests' own curriculum

A frozen copy of `curriculum/` taken on 2026-11-05 (Ceetrix story 13). Code tests read this, never the real one, so editing the book or the coach's lessons can't break a code test.

Don't edit it to follow the book. It belongs to the tests: change it only when a test needs a different shape, and then in the same commit as that test. The real curriculum is checked by `make check` (`curriculum/validate.py`).

Point the coach at it with `COACH_CURRICULUM=fixtures/curriculum`. The coach the learner runs never sets that variable.
