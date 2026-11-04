from __future__ import annotations

import json
import re
import sqlite3
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DB = ROOT / "handovergraph.db"
app = FastAPI(title="HandoverGraph API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
)


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db() -> None:
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, source_repo TEXT,
          status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, title TEXT NOT NULL, author TEXT, created_at TEXT,
          content TEXT NOT NULL, url TEXT, state TEXT, assignee TEXT, reviewer TEXT,
          module TEXT, linked_doc INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, text TEXT NOT NULL, evidence_quote TEXT NOT NULL,
          status TEXT NOT NULL, reviewer_note TEXT DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gaps (
          id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          source_id TEXT, kind TEXT NOT NULL, severity TEXT NOT NULL,
          text TEXT NOT NULL, question TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS approvals (
          case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
          reviewer TEXT NOT NULL, approved_at TEXT NOT NULL, version INTEGER NOT NULL
        );
        """)


class SourceIn(BaseModel):
    id: str | None = None
    kind: str = "note"
    title: str = "Imported project activity"
    author: str = "Team member"
    created_at: str = ""
    content: str = Field(min_length=1)
    url: str | None = None
    state: str | None = None
    assignee: str | None = None
    reviewer: str | None = None
    module: str | None = None
    linked_doc: bool = False


class CaseIn(BaseModel):
    name: str = "Project handover"
    source_repo: str | None = None
    sources: list[SourceIn] = Field(min_length=1, max_length=300)


class ClaimUpdate(BaseModel):
    status: str
    reviewer_note: str = ""
    text: str | None = None


class ApproveInput(BaseModel):
    reviewer: str = "Engineering lead"


DEMO_SOURCES = [
    {"id": "pr-42", "kind": "pull_request", "title": "PR #42 — Add checkout retry handling", "author": "Maya Chen", "created_at": "2026-10-29", "content": "Added retry handling for payment timeouts. The retry limit is three attempts with exponential backoff.", "state": "open", "assignee": "Maya Chen", "reviewer": "", "module": "payments"},
    {"id": "issue-18", "kind": "issue", "title": "Issue #18 — Idempotency key on retries", "author": "Noah Patel", "created_at": "2026-10-28", "content": "Open: add an idempotency key before enabling retries in production. Depends on the checkout retry change.", "state": "open", "assignee": "", "reviewer": "", "module": "payments"},
    {"id": "decision-7", "kind": "decision", "title": "Decision — Payment timeout policy", "author": "Maya Chen", "created_at": "2026-10-27", "content": "We chose a three-attempt retry limit with exponential backoff to reduce duplicate payment risk.", "state": "documented", "assignee": "Maya Chen", "reviewer": "Engineering lead", "module": "payments", "linked_doc": True},
    {"id": "commit-a91", "kind": "commit", "title": "Commit a91d0c2 — Add timeout guard", "author": "Maya Chen", "created_at": "2026-10-26", "content": "Added a timeout guard around the payment provider request and logged retry attempts.", "state": "merged", "assignee": "Maya Chen", "module": "payments"},
    {"id": "note-3", "kind": "note", "title": "Release note — Checkout rollout", "author": "Noah Patel", "created_at": "2026-10-25", "content": "The retry change is not enabled in production until the idempotency issue is resolved.", "state": "current", "assignee": "Noah Patel", "module": "checkout"},
]


def rowdict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def get_case(db: sqlite3.Connection, case_id: str) -> dict[str, Any]:
    case = rowdict(db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone())
    if not case:
        raise HTTPException(404, "Handover not found")
    case["sources"] = [dict(x) for x in db.execute("SELECT * FROM sources WHERE case_id=? ORDER BY created_at DESC", (case_id,))]
    case["claims"] = [dict(x) for x in db.execute("SELECT * FROM claims WHERE case_id=? ORDER BY created_at DESC", (case_id,))]
    case["gaps"] = [dict(x) for x in db.execute("SELECT * FROM gaps WHERE case_id=? ORDER BY severity, kind", (case_id,))]
    case["approval"] = rowdict(db.execute("SELECT * FROM approvals WHERE case_id=?", (case_id,)).fetchone())
    return case


def create_case(payload: CaseIn) -> str:
    case_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute("INSERT INTO cases(id,name,source_repo,created_at) VALUES(?,?,?,?)", (case_id, payload.name, payload.source_repo, now))
        for item in payload.sources:
            source_id = f"{case_id[:8]}-{item.id}" if item.id else str(uuid.uuid4())
            db.execute("""INSERT INTO sources
              (id,case_id,kind,title,author,created_at,content,url,state,assignee,reviewer,module,linked_doc)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""", (source_id, case_id, item.kind, item.title, item.author, item.created_at, item.content, item.url, item.state, item.assignee, item.reviewer, item.module, int(item.linked_doc)))
    return case_id


def generate(case_id: str) -> None:
    with connect() as db:
        if not db.execute("SELECT 1 FROM cases WHERE id=?", (case_id,)).fetchone():
            raise HTTPException(404, "Handover not found")
        db.execute("DELETE FROM claims WHERE case_id=?", (case_id,))
        db.execute("DELETE FROM gaps WHERE case_id=?", (case_id,))
        sources = [dict(x) for x in db.execute("SELECT * FROM sources WHERE case_id=?", (case_id,))]
        for s in sources:
            text = s["content"].strip()
            if not text:
                continue
            kind = "activity"
            claim_text = text
            if s["kind"] == "decision":
                kind = "decision"
                claim_text = text
            elif s["kind"] in ("pull_request", "issue"):
                kind = "work_in_flight" if (s["state"] or "").lower() in ("open", "draft") else "completed_work"
                claim_text = f"{s['title']}: {text}"
            elif s["kind"] == "commit":
                kind = "change"
                claim_text = f"{s['title']}: {text}"

            # The demo extractor is deterministic: it only proposes text that exists in the source.
            evidence = text
            status = "needs_confirmation"
            db.execute("INSERT INTO claims VALUES(?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), case_id, s["id"], kind, claim_text, evidence, status, "", datetime.now(timezone.utc).isoformat()))

            state = (s["state"] or "").lower()
            if s["kind"] == "pull_request" and state in ("open", "draft") and not s["reviewer"]:
                db.execute("INSERT INTO gaps VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), case_id, s["id"], "orphaned_work", "high", f"{s['title']} has no reviewer listed in the imported data.", "Who should review this work, and is it safe to continue?"))
            if s["kind"] == "issue" and state == "open" and not s["assignee"]:
                db.execute("INSERT INTO gaps VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), case_id, s["id"], "unowned_task", "medium", f"{s['title']} has no owner.", "Who will take responsibility for this item?"))
            if s["kind"] == "decision" and not s["linked_doc"]:
                db.execute("INSERT INTO gaps VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), case_id, s["id"], "undocumented_decision", "medium", f"{s['title']} has no linked design note.", "Is this decision still current, and where should its rationale live?"))
        db.execute("DELETE FROM approvals WHERE case_id=?", (case_id,))
        db.execute("UPDATE cases SET status='draft' WHERE id=?", (case_id,))


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    init_db()
    return {"status": "ok", "service": "HandoverGraph API"}


@app.get("/api/cases")
def list_cases() -> list[dict[str, Any]]:
    init_db()
    with connect() as db:
        rows = db.execute("""SELECT c.*, COUNT(DISTINCT s.id) AS source_count,
                          COUNT(DISTINCT cl.id) AS claim_count
                          FROM cases c LEFT JOIN sources s ON s.case_id=c.id
                          LEFT JOIN claims cl ON cl.case_id=c.id GROUP BY c.id
                          ORDER BY c.created_at DESC""").fetchall()
        return [dict(x) for x in rows]


@app.post("/api/demo")
def demo() -> dict[str, Any]:
    init_db()
    with connect() as db:
        existing = db.execute("SELECT id FROM cases WHERE source_repo='demo/payments' LIMIT 1").fetchone()
    if existing:
        cid = existing["id"]
    else:
        cid = create_case(CaseIn(name="Payments service handover (sample)", source_repo="demo/payments", sources=DEMO_SOURCES))
        generate(cid)
    with connect() as db:
        return get_case(db, cid)


@app.post("/api/demo/reset")
def reset_demo() -> dict[str, Any]:
    init_db()
    with connect() as db:
        db.execute("DELETE FROM cases WHERE source_repo='demo/payments'")
    cid = create_case(CaseIn(name="Payments service handover (sample)", source_repo="demo/payments", sources=DEMO_SOURCES))
    generate(cid)
    with connect() as db:
        return get_case(db, cid)


@app.post("/api/cases")
def import_case(payload: CaseIn) -> dict[str, Any]:
    init_db()
    cid = create_case(payload)
    generate(cid)
    with connect() as db:
        return get_case(db, cid)


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str) -> dict[str, Any]:
    init_db()
    with connect() as db:
        return get_case(db, case_id)


@app.post("/api/cases/{case_id}/generate")
def regenerate(case_id: str) -> dict[str, Any]:
    init_db()
    generate(case_id)
    with connect() as db:
        return get_case(db, case_id)


@app.patch("/api/claims/{claim_id}")
def update_claim(claim_id: str, update: ClaimUpdate) -> dict[str, Any]:
    init_db()
    if update.status not in {"confirmed", "needs_confirmation", "rejected"}:
        raise HTTPException(400, "Choose confirmed, needs_confirmation or rejected")
    with connect() as db:
        claim = rowdict(db.execute("SELECT * FROM claims WHERE id=?", (claim_id,)).fetchone())
        if not claim:
            raise HTTPException(404, "Claim not found")
        source = db.execute("SELECT content FROM sources WHERE id=?", (claim["source_id"],)).fetchone()
        new_text = update.text if update.text is not None else claim["text"]
        # Confirmation requires that the source quote still exists in its original record.
        if update.status == "confirmed" and (claim["evidence_quote"] not in source["content"] or not claim["evidence_quote"]):
            raise HTTPException(400, "This claim has no verifiable source quote")
        db.execute("UPDATE claims SET status=?, reviewer_note=?, text=? WHERE id=?", (update.status, update.reviewer_note, new_text, claim_id))
        db.execute("DELETE FROM approvals WHERE case_id=?", (claim["case_id"],))
        db.execute("UPDATE cases SET status='draft' WHERE id=?", (claim["case_id"],))
        return rowdict(db.execute("SELECT * FROM claims WHERE id=?", (claim_id,)).fetchone())


@app.post("/api/cases/{case_id}/approve")
def approve(case_id: str, payload: ApproveInput) -> dict[str, Any]:
    init_db()
    with connect() as db:
        case = rowdict(db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone())
        if not case:
            raise HTTPException(404, "Handover not found")
        claims = [dict(x) for x in db.execute("SELECT * FROM claims WHERE case_id=?", (case_id,))]
        if not claims:
            raise HTTPException(400, "Generate at least one claim before approval")
        pending = [c for c in claims if c["status"] == "needs_confirmation"]
        if pending:
            raise HTTPException(400, f"Review {len(pending)} claim(s) marked needs confirmation first")
        with connect() as db2:
            version = db2.execute("SELECT COALESCE(MAX(version),0)+1 AS v FROM approvals WHERE case_id=?", (case_id,)).fetchone()["v"]
            db2.execute("INSERT OR REPLACE INTO approvals VALUES(?,?,?,?)", (case_id, payload.reviewer, datetime.now(timezone.utc).isoformat(), version))
            db2.execute("UPDATE cases SET status='approved' WHERE id=?", (case_id,))
        return get_case(db, case_id)


@app.get("/api/share/{case_id}")
def shared_handover(case_id: str) -> dict[str, Any]:
    init_db()
    with connect() as db:
        case = get_case(db, case_id)
        if not case["approval"]:
            raise HTTPException(403, "This handover has not been approved")
        case["claims"] = [c for c in case["claims"] if c["status"] != "rejected"]
        for claim in case["claims"]:
            source = db.execute("SELECT title,url FROM sources WHERE id=?", (claim["source_id"],)).fetchone()
            claim["source_title"] = source["title"] if source else claim["source_id"]
            claim["source_url"] = source["url"] if source else None
        case["sources"] = []
        case["gaps"] = case["gaps"]
        return case


@app.post("/api/github/import")
def import_public_github(repo: str) -> dict[str, Any]:
    init_db()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise HTTPException(400, "Enter a public repository as owner/name")
    headers = {"User-Agent": "HandoverGraph-Round2-Demo", "Accept": "application/vnd.github+json"}
    sources: list[dict[str, Any]] = []
    for endpoint, kind in (("commits?per_page=5", "commit"), ("pulls?state=all&per_page=5", "pull_request"), ("issues?state=all&per_page=5", "issue")):
        req = urllib.request.Request(f"https://api.github.com/repos/{repo}/{endpoint}", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                items = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise HTTPException(exc.code, f"GitHub could not read {repo}. Check that it is public and the owner/name are correct.")
        except Exception as exc:
            raise HTTPException(502, f"Could not reach GitHub: {exc}")
        for item in items:
            # The issues endpoint also returns pull requests; skip duplicates.
            if kind == "issue" and "pull_request" in item:
                continue
            requested_reviewers = []
            if kind == "commit":
                message = item.get("commit", {}).get("message", "").splitlines()[0]
                author = item.get("author") or {}
                state = "merged"
                title = f"Commit {item.get('sha','')[:7]} — {message[:120]}"
                content = message or title
                created_at = item.get("commit", {}).get("author", {}).get("date", "")
                url = item.get("html_url")
                assignee = ""
                reviewer = ""
            else:
                author = item.get("user") or {}
                requested_reviewers = item.get("requested_reviewers") or []
                state = "merged" if item.get("merged_at") else item.get("state", "open")
                title = f"#{item.get('number')} — {item.get('title','(untitled)')}"
                content = re.sub(r"\s+", " ", item.get("body") or item.get("title", ""))[:1200]
                if not content:
                    content = title
                assignees = item.get("assignees") or []
                assignee = (item.get("assignee") or {}).get("login") or (assignees[0].get("login") if assignees else "")
                reviewer = requested_reviewers[0].get("login") if requested_reviewers else ""
                created_at = item.get("created_at", "")
                url = item.get("html_url") or item.get("url")
            sources.append({"id": f"{kind}-{item.get('number', item.get('sha','')[:7])}", "kind": kind, "title": title, "author": author.get("login", "Unknown contributor"), "created_at": created_at, "content": content, "url": url, "state": state, "assignee": assignee, "reviewer": reviewer, "module": "", "linked_doc": False})
    if not sources:
        raise HTTPException(404, "No public commits, issues or pull requests were found for that repository")
    payload = CaseIn(name=f"Handover — {repo}", source_repo=repo, sources=sources)
    cid = create_case(payload)
    generate(cid)
    with connect() as db:
        return get_case(db, cid)
