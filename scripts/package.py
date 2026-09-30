"""Package only runtime extension files; keep a stable unpacked installation path."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
DIST = ROOT / "dist"
UNPACKED = DIST / "keylane"
manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
if not version or any(part not in "0123456789." for part in version):
    raise ValueError("Invalid extension version")

DIST.mkdir(exist_ok=True)
if UNPACKED.exists():
    shutil.rmtree(UNPACKED)
shutil.copytree(SOURCE, UNPACKED, ignore=shutil.ignore_patterns(".*"))
archive = DIST / f"keylane-{version}.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
    for path in sorted(UNPACKED.rglob("*")):
        if path.is_file():
            info = zipfile.ZipInfo(path.relative_to(UNPACKED).as_posix(), (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, path.read_bytes())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(DIST / f"keylane-{version}.sha256").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
print(f"Unpacked: {UNPACKED}")
print(f"Package: {archive}")
print(f"SHA256: {digest}")
