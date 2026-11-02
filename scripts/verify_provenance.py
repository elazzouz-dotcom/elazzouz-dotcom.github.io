#!/usr/bin/env python3
"""Verify the embedded Ed25519 signature in provenance.json."""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
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

    record_path = Path(args.record)
    public_key_path = Path(args.public_key)
    record = json.loads(record_path.read_text(encoding="utf-8"))
    integrity = record.get("integrity", {})
    signature = integrity.get("signature") or {}
    if integrity.get("signed") is not True or signature.get("algorithm") != "Ed25519":
        raise SystemExit("Provenance record is not marked as an Ed25519-signed record.")

    payload = canonical_unsigned(record)
    digest = hashlib.sha256(payload).hexdigest()
    if digest != integrity.get("record_sha256"):
        raise SystemExit("Provenance digest mismatch: the record was changed after signing.")
    expected_key = signature.get("public_key_sha256")
    actual_key = public_key_fingerprint(public_key_path)
    if expected_key != actual_key:
        raise SystemExit("Public-key fingerprint mismatch.")

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        payload_path = root / "payload.json"
        signature_path = root / "signature.bin"
        payload_path.write_bytes(payload)
        signature_path.write_bytes(base64.b64decode(signature["value"], validate=True))
        subprocess.run(
            ["openssl", "pkeyutl", "-verify", "-rawin", "-pubin", "-inkey", str(public_key_path), "-in", str(payload_path), "-sigfile", str(signature_path)],
            check=True,
            capture_output=True,
            text=True,
        )

    print(f"Signature valid: {record_path}")
    print(f"record_sha256={digest}")
    print(f"public_key_sha256={actual_key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
