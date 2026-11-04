# HandoverGraph — WCC Forge 48 Round 2

HandoverGraph turns project activity into a source-linked draft handover. A reviewer checks each claim, sees the exact source text, resolves what can be resolved, and approves a version before the successor view becomes available.

## Run locally

Requirements: Node.js 18+ and Python 3.10+.

On macOS, double-click `start-demo.command` to install missing dependencies, start the API and web app, and open the app in your browser. Keep the Terminal window open while you use it; press Control-C there to stop the demo.

### 1. Start the API

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API documentation is at `http://localhost:8000/docs`.

### 2. Start the web app

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The app loads a synthetic Payments service handover on first run.

## Judge walkthrough

1. Choose **Load sample** to restart the synthetic project, or choose **Add project data**.
2. Import a public GitHub repository as `owner/repository`, or upload JSON, Markdown or plain text that you are allowed to use.
3. Open **Claim ledger**. Each draft item includes a source ID and quote. Confirm or reject items after reading the evidence.
4. Open **Knowledge gaps** to see unassigned tasks and open pull requests without reviewers detected by the current rules.
5. Once all claims have a reviewer decision, return to **Overview**, enter a reviewer name and choose **Approve handover**.
6. Choose **Open approved view**. It shows the approved claims and carries unresolved gaps forward to the successor.

## Current build (Round 2)

- React and Vite frontend with a responsive reviewer workspace.
- FastAPI backend with SQLite persistence for cases, sources, claims, gaps and approvals.
- Read-only import of public GitHub commits, pull requests and issues. No OAuth or token is required; only public repositories work in this build.
- Import of JSON source records and Markdown/plain-text notes.
- Deterministic claim drafting. Every generated claim keeps the source text used to create it; reviewers can confirm or reject each claim.
- Claim confirmation is blocked if the source quote cannot be found in the stored record.
- Rule-based detection of open pull requests without a reviewer listed and open issues without an assignee.
- Approval is blocked while claims still need a reviewer decision. The successor preview is blocked until the handover is approved.
- Synthetic demo dataset, so the main flow can be shown without private company data.

## Changes from the Round 1 plan

- Round 1 proposed an LLM to extract structured claims. This build uses deterministic drafting from imported records instead. That gives the demo a working end-to-end flow without an API key and makes the evidence check reproducible. AI-assisted extraction remains planned; it is not implemented in this version.
- Round 1 proposed GitHub OAuth with read-only scopes. This build imports public repositories through GitHub's public API without OAuth. Private repositories and user authentication are not supported.
- Round 1 proposed PostgreSQL/Supabase and permission-aware team sharing. The local demo uses SQLite and an approval-gated preview. This preview is not an access-control system and should not be used for confidential records.
- The working prototype is scoped to a single local workspace. It does not have deployment or a public judge link yet.

## Round 3 commitments

1. Add optional structured AI claim drafting behind the existing source-quote verifier; keep human review mandatory.
2. Add authenticated roles and per-source/per-section access checks for leaver, lead and successor views.
3. Extend the gap detector to cover stale references, conflicting records and sole-owner areas, with a leaver closeout question flow.

## Known limitations

- This is a local prototype. It has not been deployed for judges to open remotely.
- No login, private GitHub access, source-level authorization sync, or production security controls.
- The public GitHub importer reads commit messages and issue/PR descriptions, not full code or review-thread history.
- Rule-based gaps depend on fields present in the imported records; absence of a detected gap does not prove a handover is complete.
- The quote check proves that the text exists in the stored record, not that the statement is objectively true.
- SQLite is used for the event prototype. Production hosting would need a persistent database and deployment configuration.

## Data and privacy

Use synthetic, public, permissioned or anonymised information only. The app does not send project data to an AI service in this build. Imported data is stored locally in `backend/handovergraph.db`; remove that file to clear the local demo database.

## AI assistance disclosure

An AI assistant (Codex) helped generate portions of the prototype code and proposal text. The team should review and understand the code, make any changes it can explain, and disclose AI assistance in the format required by WCC Forge 48.

## Repository and deployment links

- Source repository: `[ADD THE TEAM'S REPOSITORY URL AFTER CREATING IT]`
- Working judge link: `[ADD A DEPLOYED URL AFTER HOSTING THE APP AND API]`

Do not submit these placeholders. The Round 2 form needs working links that judges can open.
