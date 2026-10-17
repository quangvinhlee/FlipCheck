"""Load local settings without shell evaluation, interpolation, or printing secrets."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env(root=ROOT):
    for filename in (".env", ".env.local"):
        path = Path(root) / filename
        if not path.is_file():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.removeprefix("export ").split("=", 1)
            key, value = key.strip(), value.strip()
            if not key.replace("_", "").isalnum():
                continue
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)
