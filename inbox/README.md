# inbox

**Drop generated images here. Nothing else.** `npm run ingest` picks them up.

```
inbox/<slug>.png        one image for that dish
inbox/<slug>-2.png      a second variant (ingest assigns the number itself)
inbox/done/             sources that were successfully ingested
```

This folder exists so that the generating agent never touches `corpus/`. An
image model cannot reliably hit an exact pixel size, an aspect ratio, a format
or a byte budget, so asking it to write `corpus/images/<slug>/<variant>/
<size>.<format>` means a wrong file lands silently — `imageUrlFor` builds URLs
from the index, not from the disk, so nothing notices until a card renders
broken. Here, one program does the mechanical half, once.

Ingest **moves** the source into `done/` after a successful run, rather than
deleting it: the source is the only full-resolution copy that exists, the corpus
copies are lossy and permanently capped at 1200×900, and a restyle or a bumped
size ladder wants the original back. It is cheap to keep and impossible to
recreate. Prune `done/` by hand when you are confident; `--keep` skips the move.

A **rejected** file stays where it is, and nothing is written for it.

Read `AGENTS.md` before generating anything, and `STYLE.md` for the contract.
