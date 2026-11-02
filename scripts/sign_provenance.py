#!/usr/bin/env python3
"""Sign provenance.json with an Ed25519 private key supplied through CI secrets."""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path


def canonical_unsigned(record: dict) -> bytes:
    unsigned = copy.deepcopy(record)
    integrity = unsigned.setdefault("integrity", {})
    integrity["record_sha256"] = None
    integrity["canonicalization"] = "deterministic-json-v1 (UTF-8, sorted keys, compact separators, trailing LF)"
    integrity["signed"] = False
    integrity["signature"] = None
    return (json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def run_openssl_sign(payload: bytes, private_key: str) -> bytes:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        payload_path = root / "payload.json"
        key_path = root / "private.pem"
        signature_path = root / "signature.bin"
        payload_path.write_bytes(payload)
        key_path.write_text(private_key, encoding="utf-8")
        key_path.chmod(0o600)
        subprocess.run(
            ["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", str(key_path), "-in", str(payload_path), "-out", str(signature_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        return signature_path.read_bytes()


def public_key_fingerprint(public_key_path: Path) -> str:
    der = subprocess.run(
        ["openssl", "pkey", "-pubin", "-in", str(public_key_path), "-outform", "DER"],
        check=True,
        capture_output=True,
    ).stdout
    return hashlib.sha256(der).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", default="provenance.json")
    parser.add_argument("--public-key", default="provenance-public-key.pem")
    args = parser.parse_args()

    private_key = os.environ.get("PROVENANCE_SIGNING_KEY_PEM", "")
    if not private_key.strip():
        raise SystemExit("PROVENANCE_SIGNING_KEY_PEM is required and must never be committed.")

    record_path = Path(args.record)
    public_key_path = Path(args.public_key)
    record = json.loads(record_path.read_text(encoding="utf-8"))
    payload = canonical_unsigned(record)
    signature = run_openssl_sign(payload, private_key)
    digest = hashlib.sha256(payload).hexdigest()

    updated = copy.deepcopy(record)
    updated.setdefault("integrity", {})
    updated["integrity"].update(
        {
            "record_sha256": digest,
            "canonicalization": "deterministic-json-v1 (UTF-8, sorted keys, compact separators, trailing LF)",
            "signed": True,
            "signature": {
                "algorithm": "Ed25519",
                "encoding": "base64",
                "value": base64.b64encode(signature).decode("ascii"),
                "public_key_sha256": public_key_fingerprint(public_key_path),
            },
        }
    )
    record_path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Signed {record_path} with Ed25519")
    print(f"record_sha256={digest}")
    print(f"public_key_sha256={updated['integrity']['signature']['public_key_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
