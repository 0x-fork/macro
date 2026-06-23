#!/usr/bin/env python3
"""Reconcile S3 document keys to the extensionless convention without the
fragile bun full-bucket scan.

The bun migrator (index.ts) walks the whole bucket issuing concurrent
HeadObject calls, which crashes silently under bun + the AWS SDK on large
buckets. This tool splits the work into a read-only `find` pass that streams
the bucket with list-only calls (`aws s3 ls`), then `copy` / `purge` passes
that only touch the keys `find` flagged.

A "version" is one S3 object identity `{owner}/{uuid}/{version}`. The
migration target for `{version}.{ext}` is the extensionless `{version}`.
A version is classified as:
  clean  - only the extensionless key exists (already migrated)
  both   - extensionless + leftover .ext both exist (copied, not yet deleted)
  missed - only the .ext key exists -> the read path 404s (the gap to fix)

Usage:
  # 1. find: write missed (.ext-only) keys, and optionally the purgeable
  #    (doubly-stored "both") .ext keys. Read-only; needs s3:ListBucket.
  python3 reconcile-extensionless-keys.py find \
      --out missing_ext_keys.txt --purgeable-out purgeable_ext_keys.txt

  # 2. copy missed keys to their extensionless target
  #    (needs s3:GetObject + s3:PutObject; e.g. AWS_PROFILE=s3-migrate-prod)
  python3 reconcile-extensionless-keys.py copy --in missing_ext_keys.txt --dry-run
  python3 reconcile-extensionless-keys.py copy --in missing_ext_keys.txt

  # 3. purge the redundant .ext keys whose extensionless twin already exists
  #    (needs s3:DeleteObject; dry-run by default, --apply to delete)
  python3 reconcile-extensionless-keys.py purge --in purgeable_ext_keys.txt
  python3 reconcile-extensionless-keys.py purge --in purgeable_ext_keys.txt --apply

Re-running `find` after `copy` is the verification step: missed should be 0.
Generate the purge list with `find` immediately before purging so it reflects
current bucket state.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

DEFAULT_BUCKET = os.environ.get("S3_BUCKET", "macro-document-storage-prod")
DEFAULT_PREFIX = os.environ.get("PREFIX", "macro|")
REGION = os.environ.get("AWS_REGION", "us-east-1")

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
EXTLESS_TAIL = re.compile(r"^(\d+)$")
EXT_TAIL = re.compile(r"^(\d+)\..+$")
UUID_RE = re.compile(f"^{UUID}$")


def extensionless_target(key):
    """Strip the extension from only the final segment (the version), so dots
    in the owner email (e.g. user12.foo) are never touched."""
    parts = key.split("/")
    parts[-1] = parts[-1].split(".", 1)[0]
    return "/".join(parts)


def parse_key(key):
    """Return (version_identity, form, key) or None for out-of-scope keys."""
    parts = key.split("/")
    if len(parts) != 3 or not UUID_RE.match(parts[1]):
        return None
    tail = parts[2]
    if tail == "converted.pdf":
        return None
    m = EXTLESS_TAIL.match(tail)
    if m:
        return f"{parts[0]}/{parts[1]}/{m.group(1)}", "extless", key
    m = EXT_TAIL.match(tail)
    if m:
        return f"{parts[0]}/{parts[1]}/{m.group(1)}", "ext", key
    return None


def cmd_find(args):
    out = open(args.out, "w")
    purge_out = open(args.purgeable_out, "w") if args.purgeable_out else None
    proc = subprocess.Popen(
        ["aws", "s3", "ls", f"s3://{args.bucket}/{args.prefix}",
         "--recursive", "--region", args.region],
        stdout=subprocess.PIPE, text=True,
    )
    clean = both = missed = total = 0
    cur = None
    has_extless = False
    ext_keys = []
    t0 = time.time()

    def flush():
        nonlocal clean, both, missed
        if cur is None:
            return
        if has_extless and ext_keys:
            both += 1
            if purge_out:
                for k in ext_keys:
                    purge_out.write(k + "\n")
        elif has_extless:
            clean += 1
        elif ext_keys:
            missed += 1
            for k in ext_keys:
                out.write(k + "\n")

    for line in proc.stdout:
        parts = line.rstrip("\n").split(None, 3)
        if len(parts) < 4:
            continue
        total += 1
        parsed = parse_key(parts[3])
        if not parsed:
            continue
        ident, form, key = parsed
        if ident != cur:
            flush()
            cur = ident
            has_extless = False
            ext_keys = []
        if form == "extless":
            has_extless = True
        else:
            ext_keys.append(key)
        if total % 500000 == 0:
            print(f"[{time.time()-t0:5.0f}s] scanned={total:,} clean={clean:,} "
                  f"both={both:,} missed={missed:,}", flush=True)
    flush()
    out.close()
    if purge_out:
        purge_out.close()
    rc = proc.wait()
    if rc != 0:
        print(f"WARNING: aws s3 ls exited {rc} - results may be incomplete", file=sys.stderr)
    print(f"\nscanned={total:,} keys")
    print(f"  clean (extensionless only): {clean:,}")
    print(f"  both  (leftover .ext):      {both:,}"
          + (f"  -> wrote to {args.purgeable_out}" if purge_out else ""))
    print(f"  missed (.ext only -> 404):  {missed:,}  -> wrote to {args.out}")
    return 1 if rc != 0 else 0


def cmd_copy(args):
    keys = [k.strip() for k in open(args.infile) if k.strip()]
    done_path = args.progress or (args.infile + ".done")
    done = set()
    if os.path.exists(done_path):
        done = {k.strip() for k in open(done_path) if k.strip()}
    todo = [k for k in keys if k not in done]
    print(f"{len(keys):,} keys, {len(done):,} already done, {len(todo):,} to copy"
          + (" (DRY RUN)" if args.dry_run else ""))

    done_file = None if args.dry_run else open(done_path, "a")
    errors = 0
    copied = 0
    lock_t0 = time.time()

    def do_copy(src_key):
        target = extensionless_target(src_key)
        # Pass the source raw; the AWS CLI URL-encodes copy-source once.
        # Pre-encoding here causes double-encoding -> spurious NoSuchKey.
        copy_source = f"{args.bucket}/{src_key}"
        if args.dry_run:
            return (src_key, target, None)
        r = subprocess.run(
            ["aws", "s3api", "copy-object", "--bucket", args.bucket,
             "--key", target, "--copy-source", copy_source,
             "--region", args.region, "--no-cli-pager"],
            capture_output=True, text=True,
        )
        return (src_key, target, r.returncode == 0 and None or r.stderr[:200])

    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        for src_key, target, err in ex.map(do_copy, todo):
            if args.dry_run:
                if copied < 10:
                    print(f"  would copy {src_key} -> {target}")
                copied += 1
                continue
            if err:
                errors += 1
                print(f"ERROR {src_key}: {err}", file=sys.stderr)
            else:
                copied += 1
                done_file.write(src_key + "\n")
                if copied % 1000 == 0:
                    done_file.flush()
                    print(f"[{time.time()-lock_t0:5.0f}s] copied={copied:,} errors={errors}", flush=True)
    if done_file:
        done_file.close()
    print(f"\n{'would copy' if args.dry_run else 'copied'}={copied:,} errors={errors}")
    return 1 if errors else 0


def cmd_purge(args):
    keys = [k.strip() for k in open(args.infile) if k.strip()]
    done_path = args.progress or (args.infile + ".done")
    done = set()
    if os.path.exists(done_path):
        done = {k.strip() for k in open(done_path) if k.strip()}
    todo = [k for k in keys if k not in done]
    print(f"{len(keys):,} .ext keys, {len(done):,} already purged, {len(todo):,} to purge"
          + ("" if args.apply else "   (DRY RUN - pass --apply to delete)"))
    if not args.apply:
        for k in todo[:10]:
            print(f"  would delete {k}  (keeps {extensionless_target(k)})")
        return 0

    def twin_exists(k):
        r = subprocess.run(["aws", "s3api", "head-object", "--bucket", args.bucket,
                            "--key", extensionless_target(k), "--region", args.region],
                           capture_output=True, text=True)
        return k if r.returncode == 0 else None

    done_file = open(done_path, "a")
    deleted = errors = skipped = 0
    t0 = time.time()
    for start in range(0, len(todo), 1000):
        batch = todo[start:start + 1000]
        if args.verify:
            # only delete a .ext key whose extensionless twin still exists
            with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
                verified = [k for k in ex.map(twin_exists, batch) if k]
            skipped += len(batch) - len(verified)
            batch = verified
            if not batch:
                continue
        payload = json.dumps({"Objects": [{"Key": k} for k in batch], "Quiet": True})
        r = subprocess.run(["aws", "s3api", "delete-objects", "--bucket", args.bucket,
                            "--region", args.region, "--no-cli-pager", "--delete", payload],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print(f"BATCH FAILED at offset {start}: {r.stderr[:300]}", file=sys.stderr)
            sys.exit(1)
        batch_errors = json.loads(r.stdout).get("Errors", []) if r.stdout.strip() else []
        failed = {e.get("Key") for e in batch_errors}
        for k in batch:
            if k not in failed:
                done_file.write(k + "\n")
        done_file.flush()
        deleted += len(batch) - len(failed)
        errors += len(failed)
        for e in batch_errors[:5]:
            print(f"ERROR {e.get('Key')}: {e.get('Code')} {e.get('Message')}", file=sys.stderr)
        print(f"[{time.time()-t0:5.0f}s] purged={deleted:,} errors={errors} skipped={skipped}", flush=True)
    done_file.close()
    print(f"\npurged={deleted:,} errors={errors} skipped(no twin)={skipped}")
    return 1 if errors else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--region", default=REGION)
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("find", help="read-only: list bucket, write .ext-only (and optionally purgeable) keys")
    f.add_argument("--prefix", default=DEFAULT_PREFIX)
    f.add_argument("--out", default="missing_ext_keys.txt")
    f.add_argument("--purgeable-out", default=None,
                   help="also write doubly-stored .ext keys (twin exists) here")
    f.set_defaults(func=cmd_find)

    c = sub.add_parser("copy", help="copy .ext keys to their extensionless target")
    c.add_argument("--in", dest="infile", required=True)
    c.add_argument("--concurrency", type=int, default=20)
    c.add_argument("--progress", default=None, help="done-keys file for resume")
    c.add_argument("--dry-run", action="store_true")
    c.set_defaults(func=cmd_copy)

    p = sub.add_parser("purge", help="delete redundant .ext keys whose extensionless twin exists")
    p.add_argument("--in", dest="infile", required=True)
    p.add_argument("--apply", action="store_true", help="actually delete (default: report only)")
    p.add_argument("--verify", action="store_true",
                   help="HeadObject the extensionless twin before deleting each key")
    p.add_argument("--concurrency", type=int, default=20, help="parallelism for --verify")
    p.add_argument("--progress", default=None, help="done-keys file for resume")
    p.set_defaults(func=cmd_purge)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
