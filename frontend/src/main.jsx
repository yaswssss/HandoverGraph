import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2,
  ChevronDown, CircleHelp, CirclePlus, Clock3, Code2, FileText, GitBranch,
  Github, GitPullRequest, LayoutDashboard, Link2, LoaderCircle, LockKeyhole,
  MessageSquareWarning, MoreHorizontal, Network, Search, ShieldCheck,
  ShieldQuestion, Sparkles, Upload, UserRound, Users, X,
} from 'lucide-react'
import './styles.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.')
  return data
}

const statusMeta = {
  confirmed: { label: 'Confirmed', icon: CheckCircle2, className: 'confirmed' },
  needs_confirmation: { label: 'Needs review', icon: ShieldQuestion, className: 'review' },
  rejected: { label: 'Rejected', icon: X, className: 'rejected' },
}

function Badge({ status }) {
  const meta = statusMeta[status] || statusMeta.needs_confirmation
  const Icon = meta.icon
  return <span className={`badge ${meta.className}`}><Icon size={13} />{meta.label}</span>
}

function App() {
  const [caseData, setCaseData] = useState(null)
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [repo, setRepo] = useState('')
  const [search, setSearch] = useState('')
  const [reviewer, setReviewer] = useState('Engineering lead')
  const [importOpen, setImportOpen] = useState(false)
  const [shareView, setShareView] = useState(window.location.pathname.startsWith('/share/'))

  const loadCase = async id => {
    const data = await request(`/api/cases/${id}`)
    setCaseData(data)
    return data
  }

  useEffect(() => {
    let active = true
    const init = async () => {
      try {
        if (window.location.pathname.startsWith('/share/')) {
          const id = window.location.pathname.split('/').filter(Boolean).at(-1)
          const data = await request(`/api/share/${id}`)
          if (active) setCaseData(data)
          return
        }
        const cases = await request('/api/cases')
        if (cases.length) {
          const data = await request(`/api/cases/${cases[0].id}`)
          if (active) setCaseData(data)
        } else {
          const data = await request('/api/demo', { method: 'POST', body: '{}' })
          if (active) setCaseData(data)
        }
      } catch (e) { if (active) setError(e.message) }
    }
    init()
    return () => { active = false }
  }, [])

  const pending = useMemo(() => (caseData?.claims || []).filter(c => c.status === 'needs_confirmation').length, [caseData])
  const visibleClaims = useMemo(() => (caseData?.claims || []).filter(c => `${c.text} ${c.kind} ${c.status}`.toLowerCase().includes(search.toLowerCase())), [caseData, search])

  const run = async (label, action) => {
    setBusy(true); setError(''); setNotice('')
    try { const result = await action(); if (result) setCaseData(result); setNotice(label) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const loadDemo = () => run('Sample handover reset and loaded.', async () => request('/api/demo/reset', { method: 'POST', body: '{}' }))

  const importRepo = async e => {
    e.preventDefault()
    if (!repo.trim()) return
    await run('Public repository imported.', async () => {
      const q = new URLSearchParams({ repo: repo.trim() })
      const data = await request(`/api/github/import?${q}`, { method: 'POST', body: '{}' })
      setRepo('')
      return data
    })
  }

  const importFile = async file => {
    if (!file) return
    await run('Project records imported and draft prepared.', async () => {
      let sources
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(await file.text())
        sources = Array.isArray(parsed) ? parsed : parsed.sources
        if (!Array.isArray(sources) || !sources.length) throw new Error('JSON must be a list of sources or an object with a sources list.')
      } else {
        const content = await file.text()
        if (!content.trim()) throw new Error('That file is empty.')
        sources = [{ kind: 'note', title: file.name, content, author: 'Imported document' }]
      }
      const data = await request('/api/cases', { method: 'POST', body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, ''), sources }) })
      setImportOpen(false)
      return data
    })
  }

  const updateClaim = (claim, status) => run(status === 'confirmed' ? 'Claim confirmed.' : 'Claim rejected.', async () => {
    await request(`/api/claims/${claim.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    return loadCase(caseData.id)
  })

  const approveCase = () => run('Approved handover is ready to preview.', async () => request(`/api/cases/${caseData.id}/approve`, { method: 'POST', body: JSON.stringify({ reviewer }) }))

  const showShare = () => {
    const path = `/share/${caseData.id}`
    window.history.pushState({}, '', path)
    setShareView(true); setTab('share')
  }

  if (!caseData && error) return <div className="fatal"><div className="fatal-card"><div className="logo-mark"><Network size={21} /></div><h1>HandoverGraph API isn’t running yet</h1><p>Start the backend and frontend using the steps in the project README, then refresh this page.</p><code>{error}</code></div></div>
  if (!caseData) return <div className="loading"><LoaderCircle className="spin" />Opening your workspace…</div>

  if (shareView) return <SharePage caseData={caseData} onBack={() => { window.history.pushState({}, '', '/'); setShareView(false); setTab('overview') }} />

  const nav = [
    ['overview', LayoutDashboard, 'Overview'], ['claims', ShieldCheck, 'Claim ledger'], ['gaps', MessageSquareWarning, 'Knowledge gaps'], ['sources', BookOpen, 'Sources'],
  ]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo-mark"><Network size={19} strokeWidth={2.3} /></div><span>handover<span className="brand-light">graph</span></span><button className="icon-button sidebar-more" aria-label="More"><MoreHorizontal size={18} /></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">HG</div><div><b>Engineering workspace</b><small>Free demo</small></div><ChevronDown size={15} /></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="main-nav">{nav.map(([key, Icon, title]) => <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}><Icon size={17} /><span>{title}</span>{key === 'gaps' && caseData.gaps.length > 0 && <i>{caseData.gaps.length}</i>}</button>)}</nav>
      <div className="side-label projects-label">HANDOVERS <button className="tiny-plus" onClick={() => setImportOpen(true)} aria-label="Add handover"><CirclePlus size={15} /></button></div>
      <button className="project-link current-project" onClick={() => setTab('overview')}><span className="project-dot" />{caseData.name}</button>
      <div className="sidebar-bottom"><div className="trust-card"><div><ShieldCheck size={15} /><b>Review before sharing</b></div><p>The successor view stays locked until the reviewer approves.</p></div><button className="profile-button"><div className="profile-avatar"><UserRound size={16} /></div><span><b>Demo reviewer</b><small>Reviewer access</small></span><MoreHorizontal size={17} /></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{caseData.name}</b></div><div className="top-actions"><span className="environment-pill"><span /> Demo environment</span><button className="avatar-small" title="Reviewer">R</button></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> HANDOVER WORKSPACE</div><h1>{caseData.name}</h1><p className="page-subtitle">A source-linked view of work in progress, decisions and unanswered questions.</p></div><div className="heading-actions"><button className="button secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> Add project data</button><button className="button primary" onClick={loadDemo} disabled={busy}><Sparkles size={15} /> Load sample</button></div></div>

        {(error || notice) && <div className={`toast ${error ? 'error' : 'success'}`}><span>{error || notice}</span><button onClick={() => { setError(''); setNotice('') }}><X size={15} /></button></div>}

        <section className="hero-banner"><div className="hero-copy"><div className="hero-kicker"><span className="live-dot" /> ROUND 2 BUILD</div><h2>Pick up where your teammate left off.</h2><p>Review the evidence, resolve open questions, and approve a handover the next developer can trust.</p><div className="hero-meta"><span><GitBranch size={14} /> {caseData.source_repo || 'Imported project'}</span><span><Clock3 size={14} /> {caseData.sources.length} source records</span></div></div><div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-node node-a"><Code2 size={17}/></div><div className="art-node node-b"><GitPullRequest size={17}/></div><div className="art-node node-c"><FileText size={17}/></div><div className="art-center"><Network size={24}/></div><div className="art-connection" /></div></section>

        <div className="metrics-grid"><Metric icon={FileText} label="Evidence-backed claims" value={caseData.claims.length} detail={`${caseData.claims.filter(c => c.status === 'confirmed').length} confirmed`} tone="blue"/><Metric icon={MessageSquareWarning} label="Knowledge gaps" value={caseData.gaps.length} detail={`${caseData.gaps.filter(g => g.severity === 'high').length} need attention`} tone="amber"/><Metric icon={BookOpen} label="Project sources" value={caseData.sources.length} detail="Records in scope" tone="green"/><Metric icon={ShieldCheck} label="Handover status" value={caseData.approval ? 'Approved' : 'In review'} detail={caseData.approval ? `v${caseData.approval.version} · ${caseData.approval.reviewer}` : `${pending} claims need a decision`} tone="purple" compact/></div>

        <div className="content-tabs">{nav.map(([key, Icon, title]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}><Icon size={15}/>{title}{key === 'gaps' && <span className="tab-count">{caseData.gaps.length}</span>}</button>)}</div>

        {tab === 'overview' && <Overview caseData={caseData} onTab={setTab} onApprove={approveCase} pending={pending} busy={busy} reviewer={reviewer} setReviewer={setReviewer} onShare={showShare} />}
        {tab === 'claims' && <Claims claims={visibleClaims} sources={caseData.sources} search={search} setSearch={setSearch} busy={busy} onUpdate={updateClaim} />}
        {tab === 'gaps' && <Gaps gaps={caseData.gaps} sources={caseData.sources} />}
        {tab === 'sources' && <Sources sources={caseData.sources} />}
      </div>
      <footer className="app-footer"><span>HandoverGraph <b>Round 2 prototype</b></span><span>Use synthetic, public, or authorised project data only.</span></footer>
    </main>
    {importOpen && <ImportModal onClose={() => setImportOpen(false)} repo={repo} setRepo={setRepo} onRepo={importRepo} onFile={importFile} busy={busy} />}
  </div>
}

function Metric({ icon: Icon, label, value, detail, tone, compact }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={17}/></div><div className="metric-content"><span className="metric-label">{label}</span><strong className={compact ? 'small-value' : ''}>{value}</strong><small>{detail}</small></div></div>
}

function Overview({ caseData, onTab, onApprove, pending, busy, reviewer, setReviewer, onShare }) {
  const recent = caseData.claims.slice(0, 4)
  const allReviewed = pending === 0 && caseData.claims.length > 0
  return <div className="overview-grid">
    <section className="panel claim-panel"><div className="panel-heading"><div><h3>Recent claims</h3><p>Statements reconstructed from project activity.</p></div><button className="text-button" onClick={() => onTab('claims')}>View ledger <ArrowRight size={14}/></button></div>
      <div className="claim-list">{recent.map(claim => <div className="claim-row" key={claim.id}><div className="claim-kind"><KindIcon kind={claim.kind}/></div><div className="claim-body"><div className="claim-title">{claim.text}</div><div className="claim-source"><Link2 size={12}/> {sourceLabel(caseData.sources, claim.source_id)} <span>·</span> evidence attached</div></div><Badge status={claim.status}/></div>)}</div>
      {recent.length === 0 && <Empty text="Generate a draft to see claims here."/>}
      <button className="panel-footer-button" onClick={() => onTab('claims')}>Open claim ledger <ArrowRight size={14}/></button>
    </section>
    <div className="right-column"><section className="panel gaps-panel"><div className="panel-heading"><div><h3>Open questions</h3><p>Gaps the team should resolve.</p></div><button className="icon-button" onClick={() => onTab('gaps')} aria-label="View questions"><ArrowRight size={16}/></button></div>
      {caseData.gaps.slice(0, 3).map(gap => <div className="gap-mini" key={gap.id}><span className={`severity-dot ${gap.severity}`}/><div><b>{gap.text}</b><small>{gap.question}</small></div></div>)}
      {caseData.gaps.length === 0 && <Empty text="No gaps detected in this source set."/>}
      {caseData.gaps.length > 3 && <button className="text-button gap-all" onClick={() => onTab('gaps')}>See all {caseData.gaps.length} questions <ArrowRight size={13}/></button>}
    </section>
    <section className="panel approve-panel"><div className="approve-icon"><ShieldCheck size={18}/></div><div className="approve-copy"><h3>{caseData.approval ? 'Approved for handover' : 'Ready for a human review?'}</h3><p>{caseData.approval ? `Approved by ${caseData.approval.reviewer}. The share preview is available.` : pending ? `${pending} claim${pending > 1 ? 's' : ''} still need confirmation or rejection.` : 'Review the claims, then approve a snapshot for the successor.'}</p></div>
      {!caseData.approval && <label className="reviewer-field">Reviewer name<input value={reviewer} onChange={e => setReviewer(e.target.value)} /></label>}
      {caseData.approval ? <button className="button secondary full-button" onClick={onShare}><Link2 size={15}/> Open approved view</button> : <button className="button primary full-button" disabled={!allReviewed || busy} onClick={onApprove}><Check size={15}/>{busy ? 'Saving…' : allReviewed ? 'Approve handover' : 'Review claims to continue'}</button>}
    </section></div>
    <section className="workflow-strip"><div className="workflow-title"><span>HANDOVER FLOW</span><small>Evidence stays visible at every step.</small></div><div className="workflow-step done"><i><Check size={13}/></i><b>Connect</b></div><ArrowRight className="workflow-arrow" size={15}/><div className="workflow-step done"><i><Check size={13}/></i><b>Reconstruct</b></div><ArrowRight className="workflow-arrow" size={15}/><div className={`workflow-step ${pending ? 'current' : 'done'}`}><i>{pending ? '3' : <Check size={13}/>}</i><b>Review</b></div><ArrowRight className="workflow-arrow" size={15}/><div className={`workflow-step ${caseData.approval ? 'done' : ''}`}><i>{caseData.approval ? <Check size={13}/> : '4'}</i><b>Handover</b></div></section>
  </div>
}

function Claims({ claims, sources, search, setSearch, busy, onUpdate }) {
  return <section className="panel ledger-panel"><div className="panel-heading ledger-heading"><div><h3>Claim ledger</h3><p>Review each statement against the exact project record it came from.</p></div><div className="search-field"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a claim"/></div></div>
    <div className="ledger-table-head"><span>CLAIM</span><span>STATUS</span><span>REVIEW</span></div>
    {claims.map(claim => { const source = sources.find(item => item.id === claim.source_id); return <article className="ledger-item" key={claim.id}><div className="ledger-claim"><div className="ledger-title"><KindIcon kind={claim.kind}/><b>{claim.text}</b></div><div className="evidence-box"><div className="evidence-label"><span><Link2 size={12}/> SOURCE EVIDENCE</span><span>{claim.source_id}</span></div><blockquote>“{claim.evidence_quote}”</blockquote><small>{source?.url ? <a className="evidence-source-link" href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : sourceLabel(sources, claim.source_id)}</small></div>{claim.reviewer_note && <p className="review-note">Reviewer note: {claim.reviewer_note}</p>}</div><div><Badge status={claim.status}/></div><div className="review-actions">{claim.status === 'needs_confirmation' ? <><button disabled={busy} className="mini-action confirm" onClick={() => onUpdate(claim, 'confirmed')} title="Confirm claim"><Check size={14}/></button><button disabled={busy} className="mini-action reject" onClick={() => onUpdate(claim, 'rejected')} title="Reject claim"><X size={14}/></button></> : <span className="reviewed-label"><CheckCircle2 size={14}/> Reviewed</span>}</div></article>})}
    {!claims.length && <Empty text="No claims match your search."/>}
    <div className="ledger-note"><CircleHelp size={15}/><span>Confirmation checks that the cited quote exists in the stored source. It does not prove the claim is objectively true; use your judgment before approving.</span></div>
  </section>
}

function Gaps({ gaps, sources }) {
  const labels = { orphaned_work: 'Unreviewed work', unowned_task: 'No owner', undocumented_decision: 'Decision needs context', stale_reference: 'Stale reference', possible_contradiction: 'Possible conflict' }
  return <section className="panel gaps-full"><div className="panel-heading"><div><h3>Knowledge gaps</h3><p>Questions surfaced from the project records. Resolve them with the departing teammate where possible.</p></div><span className="count-chip">{gaps.length} found</span></div>
    {gaps.map(gap => <article className="gap-card" key={gap.id}><div className={`gap-severity ${gap.severity}`}>{gap.severity === 'high' ? 'HIGH' : 'MEDIUM'}</div><div className="gap-card-main"><div className="gap-type">{labels[gap.kind] || gap.kind.replaceAll('_', ' ')}</div><h4>{gap.text}</h4><p className="gap-question"><MessageSquareWarning size={14}/>{gap.question}</p><small>Source: {sourceLabel(sources, gap.source_id)}</small></div></article>)}
    {!gaps.length && <Empty text="No gaps found. That may mean the source set is complete, or that it contains too little activity to detect issues."/>}
    <div className="gap-disclaimer"><ShieldQuestion size={15}/><span>Gap rules use the fields present in the imported data. A gap is a prompt to check, not a conclusion about the project.</span></div>
  </section>
}

function Sources({ sources }) {
  const icons = { commit: Code2, pull_request: GitPullRequest, issue: CircleHelp, decision: BookOpen, note: FileText }
  return <section className="panel sources-panel"><div className="panel-heading"><div><h3>Sources in this handover</h3><p>Original records retained for checking each claim.</p></div><span className="count-chip">{sources.length} records</span></div>
    {sources.map(source => { const Icon = icons[source.kind] || FileText; return <article className="source-row" key={source.id}><div className="source-kind-icon"><Icon size={16}/></div><div className="source-main"><a href={source.url || '#'} target="_blank" rel="noreferrer">{source.title}</a><p>{source.content}</p><div><span>{source.kind.replaceAll('_', ' ')}</span><span>By {source.author || 'Unknown'}</span><span>{source.created_at || 'Date not provided'}</span></div></div><span className="source-state">{source.state || 'Imported'}</span></article>})}
    {!sources.length && <Empty text="No sources were imported."/>}
  </section>
}

function SharePage({ caseData, onBack }) {
  if (!caseData.approval) return <div className="fatal"><div className="fatal-card"><div className="logo-mark"><LockKeyhole size={20}/></div><h1>This handover isn’t approved</h1><p>Return to the reviewer workspace, check the claims and approve it before sharing.</p><button className="button primary" onClick={onBack}>Back to workspace</button></div></div>
  return <main className="share-page"><header className="share-header"><div className="brand"><div className="logo-mark"><Network size={18}/></div><span>handover<span className="brand-light">graph</span></span></div><span className="approved-label"><CheckCircle2 size={14}/> Approved handover · v{caseData.approval.version}</span></header><div className="share-content"><button className="text-button back-link" onClick={onBack}>← Reviewer workspace</button><div className="eyebrow">PROJECT HANDOVER</div><h1>{caseData.name}</h1><p className="share-subtitle">Prepared for the incoming teammate. Every confirmed item links to evidence from the project records.</p><div className="share-callout"><ShieldCheck size={18}/><span>Reviewed by <b>{caseData.approval.reviewer}</b> on {new Date(caseData.approval.approved_at).toLocaleDateString()}</span></div><h2>Work and decisions</h2>{caseData.claims.map(c => <article className="share-claim" key={c.id}><Badge status={c.status}/><p>{c.text}</p><blockquote>“{c.evidence_quote}”</blockquote><small>Source reference: {c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer">{c.source_title}</a> : c.source_title || c.source_id}</small></article>)}<h2>Open questions to carry forward</h2>{caseData.gaps.map(g => <article className="share-gap" key={g.id}><span className={`severity-dot ${g.severity}`}/><div><b>{g.text}</b><p>{g.question}</p></div></article>)}{!caseData.gaps.length && <p className="quiet">No open questions were detected in the imported records.</p>}<button className="button secondary" onClick={onBack}>Back to workspace</button></div></main>
}

function ImportModal({ onClose, repo, setRepo, onRepo, onFile, busy }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="import-modal"><div className="modal-heading"><div><span className="eyebrow">ADD A PROJECT</span><h2>Bring in project activity</h2><p>Use a public repo or a file you are allowed to share.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><form onSubmit={onRepo} className="repo-form"><label>Public GitHub repository</label><div className="repo-input"><Github size={17}/><input value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repository"/><button className="button primary" disabled={busy || !repo.trim()}>{busy ? 'Importing…' : 'Import'}</button></div><small>Reads public commits, pull requests and issues. No write access or token required.</small></form><div className="modal-divider"><span>OR</span></div><label className="upload-drop"><input type="file" accept=".json,.md,.txt,text/plain,application/json" onChange={e => onFile(e.target.files?.[0])}/><div className="upload-icon"><Upload size={18}/></div><b>Choose a JSON, Markdown or text file</b><span>JSON should contain a list of source records or a “sources” list.</span><small>Use public, synthetic or approved data. PDF text import is not included in this build.</small></label><div className="modal-privacy"><LockKeyhole size={14}/>Imported records stay in this local demo database.</div></section></div>
}

function KindIcon({ kind }) {
  const Icon = kind === 'decision' ? BookOpen : kind === 'work_in_flight' ? GitPullRequest : kind === 'change' ? Code2 : FileText
  return <Icon size={15}/>
}
function sourceLabel(sources, id) { const source = (sources || []).find(s => s.id === id); return source ? source.title : id }
function Empty({ text }) { return <div className="empty-state"><div><BookOpen size={18}/></div><p>{text}</p></div> }

createRoot(document.getElementById('root')).render(<App />)
