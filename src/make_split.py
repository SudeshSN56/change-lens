"""Write data/splits/{train,test}.txt once. Never regenerate.

The 742 test pairs serve double duty: they are the evaluation set *and* the
searchable index the chatbot queries. Nothing the chatbot returns was ever
trained on, and the split file on disk is the proof.
"""

import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECOND = ROOT / "data" / "second"
SPLITS = ROOT / "data" / "splits"
SEED = 42
N_TEST = 742


def main():
    ids = sorted(p.stem for p in (SECOND / "im1").glob("*.png"))
    if not ids:
        raise SystemExit(f"no images found under {SECOND / 'im1'}")

    # every id must exist in all four folders
    for sub in ("im2", "label1", "label2"):
        missing = [i for i in ids if not (SECOND / sub / f"{i}.png").exists()]
        if missing:
            raise SystemExit(f"{len(missing)} ids missing from {sub}, e.g. {missing[:5]}")

    SPLITS.mkdir(parents=True, exist_ok=True)
    train_f, test_f = SPLITS / "train.txt", SPLITS / "test.txt"
    if train_f.exists() or test_f.exists():
        raise SystemExit(
            "split files already exist -- refusing to regenerate. Delete them "
            "by hand if you really mean to invalidate every trained model."
        )

    shuffled = list(ids)
    random.Random(SEED).shuffle(shuffled)
    test = sorted(shuffled[:N_TEST])
    train = sorted(shuffled[N_TEST:])

    assert not (set(train) & set(test)), "train/test overlap"
    assert len(train) + len(test) == len(ids)

    train_f.write_text("\n".join(train) + "\n")
    test_f.write_text("\n".join(test) + "\n")
    print(f"{len(ids)} pairs -> train {len(train)} / test {len(test)} (seed {SEED})")
    print(f"wrote {train_f}\nwrote {test_f}")


if __name__ == "__main__":
    main()
