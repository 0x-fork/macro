#!/usr/bin/env python3
"""Hard-delete orphaned documents (DB row + related rows), mirroring the app's
permanent-delete path.

Use this for documents that the DB lists as active with content in object
storage, but which have NO S3 object at all (produced by
`reconcile-extensionless-keys.py find` cross-referenced with the DB). Because
the blob is already gone, the app's S3-cleanup enqueue is a no-op and is
skipped here.

It reproduces `macro_db_client::document::delete_document_bulk_tsx` plus the
permanent-delete handler's entity-mention cleanup, in one transaction per
batch (so a batch is all-or-nothing):

  Pin -> UserHistory -> SharePermission (via DocumentPermission) -> Document
  -> entity_access -> comms_entity_mentions

It does NOT remove OpenSearch entries; these docs failed indexing (NoSuchKey)
so they are not in the index. Pass --remove-from-search to additionally enqueue
RemoveDocument to the search queue if you want belt-and-suspenders.

Connection: reads DATABASE_URL from the env, e.g.
  export DATABASE_URL="$(aws secretsmanager get-secret-value \
     --secret-id macro-db-prod --region us-east-1 --query SecretString --output text)?sslmode=require"

Usage:
  # blast-radius report, deletes nothing (default):
  python3 delete-orphan-documents.py --in missing_doc_ids.txt
  # actually delete:
  python3 delete-orphan-documents.py --in missing_doc_ids.txt --apply
"""

import argparse
import os
import subprocess
import sys

TABLES_REPORT = [
    ('Pin', 'SELECT count(*) FROM "Pin" WHERE "pinnedItemId" IN (SELECT id FROM _ids) AND "pinnedItemType"=\'document\''),
    ('UserHistory', 'SELECT count(*) FROM "UserHistory" WHERE "itemId" IN (SELECT id FROM _ids) AND "itemType"=\'document\''),
    ('SharePermission', 'SELECT count(*) FROM "SharePermission" sp JOIN "DocumentPermission" dp ON dp."sharePermissionId"=sp.id WHERE dp."documentId" IN (SELECT id FROM _ids)'),
    ('entity_access', 'SELECT count(*) FROM "entity_access" WHERE entity_id IN (SELECT id::uuid FROM _ids) AND entity_type=\'document\''),
    ('comms_entity_mentions', 'SELECT count(*) FROM comms_entity_mentions WHERE source_entity_id IN (SELECT id FROM _ids)'),
    ('Document', 'SELECT count(*) FROM "Document" WHERE id IN (SELECT id FROM _ids)'),
]

# Mirrors delete_document_bulk_tsx + handler entity-mention cleanup. Order matters:
# SharePermission joins DocumentPermission so it must run before Document is deleted.
DELETE_STMTS = [
    'DELETE FROM "Pin" WHERE "pinnedItemId" IN (SELECT id FROM _ids) AND "pinnedItemType"=\'document\'',
    'DELETE FROM "UserHistory" WHERE "itemId" IN (SELECT id FROM _ids) AND "itemType"=\'document\'',
    'DELETE FROM "SharePermission" sp USING "DocumentPermission" dp WHERE dp."sharePermissionId"=sp.id AND dp."documentId" IN (SELECT id FROM _ids)',
    'DELETE FROM "Document" WHERE id IN (SELECT id FROM _ids)',
    'DELETE FROM "entity_access" WHERE entity_id IN (SELECT id::uuid FROM _ids) AND entity_type=\'document\'',
    'DELETE FROM comms_entity_mentions WHERE source_entity_id IN (SELECT id FROM _ids)',
]

SEARCH_QUEUE = "https://sqs.us-east-1.amazonaws.com/569036502058/search-event-queue-prod"


def psql(dburl, sql, extra=()):
    r = subprocess.run(["psql", dburl, "-v", "ON_ERROR_STOP=1", "-q", "-P", "pager=off",
                        *extra, "-c", sql], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def values_clause(ids):
    return ",".join("('" + i.replace("'", "''") + "')" for i in ids)


def cmd_report(dburl, ids):
    vals = values_clause(ids)
    selects = " UNION ALL ".join(f"SELECT '{name}' AS tbl, ({q}) AS n" for name, q in TABLES_REPORT)
    sql = f"CREATE TEMP TABLE _ids(id text); INSERT INTO _ids VALUES {vals}; {selects};"
    rc, out, err = psql(dburl, sql, extra=("-At", "-F", "|"))
    if rc != 0:
        print(err, file=sys.stderr); sys.exit(1)
    print(f"blast radius for {len(ids):,} ids (rows that WOULD be deleted):")
    for ln in out.splitlines():
        if "|" in ln:
            name, n = ln.split("|", 1)
            print(f"  {name:24} {int(n):>10,}")


def cmd_apply(dburl, ids, batch, done_path, remove_from_search):
    done = set()
    if os.path.exists(done_path):
        done = {x.strip() for x in open(done_path) if x.strip()}
    todo = [i for i in ids if i not in done]
    print(f"{len(ids):,} ids, {len(done):,} already done, {len(todo):,} to delete")
    done_f = open(done_path, "a")
    deleted_docs = 0
    for start in range(0, len(todo), batch):
        chunk = todo[start:start + batch]
        vals = values_clause(chunk)
        stmts = ";\n".join(DELETE_STMTS)
        sql = (f"BEGIN;\nCREATE TEMP TABLE _ids(id text) ON COMMIT DROP;\n"
               f"INSERT INTO _ids VALUES {vals};\n{stmts};\nCOMMIT;")
        rc, out, err = psql(dburl, sql)
        if rc != 0:
            print(f"BATCH FAILED at offset {start} (rolled back): {err[:300]}", file=sys.stderr)
            sys.exit(1)
        for i in chunk:
            done_f.write(i + "\n")
        done_f.flush()
        deleted_docs += len(chunk)
        if remove_from_search:
            for i in chunk:
                subprocess.run(["aws", "sqs", "send-message", "--queue-url", SEARCH_QUEUE,
                                "--region", "us-east-1", "--message-body",
                                '{"RemoveDocument":{"document_id":"' + i + '"}}'],
                               capture_output=True, text=True)
        print(f"  committed {deleted_docs:,}/{len(todo):,}")
    print(f"done; deleted {deleted_docs:,} documents (+ related rows)")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="infile", default="missing_doc_ids.txt")
    ap.add_argument("--batch-size", type=int, default=500)
    ap.add_argument("--apply", action="store_true", help="actually delete (default: report only)")
    ap.add_argument("--progress", default=None, help="done-ids file for resume")
    ap.add_argument("--remove-from-search", action="store_true",
                    help="also enqueue RemoveDocument to the search queue")
    args = ap.parse_args()

    dburl = os.environ.get("DATABASE_URL")
    if not dburl:
        print("set DATABASE_URL (see header)", file=sys.stderr); sys.exit(2)
    ids = [x.strip() for x in open(args.infile) if x.strip()]
    if not ids:
        print("no ids", file=sys.stderr); sys.exit(1)

    if args.apply:
        cmd_apply(dburl, ids, args.batch_size, args.progress or (args.infile + ".done"),
                  args.remove_from_search)
    else:
        cmd_report(dburl, ids)


if __name__ == "__main__":
    main()
