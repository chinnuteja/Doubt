/**
 * app.js — Doubt Dashboard Application Logic
 * 
 * Orchestrates the demo flow:
 * 1. Run QA Agent → populate left panel with confident checklist
 * 2. Verify with Doubt → populate right panel with evidence, animate score
 * 3. Show end screen with full report
 */

// ─── State ────────────────────────────────────────────────────────────────
let agentOutput = null;
let verificationReport = null;

// ─── DOM References ───────────────────────────────────────────────────────
const statusPill = document.getElementById('statusPill');
const statusText = statusPill.querySelector('.status-text');
const btnRunAgent = document.getElementById('btnRunAgent');
const btnVerify = document.getElementById('btnVerify');
const agentBody = document.getElementById('agentBody');
const evidenceBody = document.getElementById('evidenceBody');
const scoreValue = document.getElementById('scoreValue');
const scoreFill = document.getElementById('scoreFill');
const scoreSummary = document.getElementById('scoreSummary');
const scoreStats = document.getElementById('scoreStats');
const btnHold = document.getElementById('btnHold');
const summaryBar = document.getElementById('summaryBar');
const summaryContent = document.getElementById('summaryContent');

// ─── Run QA Agent ─────────────────────────────────────────────────────────
async function runAgent() {
  // Update UI state
  setStatus('running', 'Agent reviewing...');
  btnRunAgent.disabled = true;

  // Show loading state in agent panel
  agentBody.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p class="loading-text">QA Agent reviewing payment-service v2.3...</p>
    </div>
  `;
  document.getElementById('panelAgent').classList.add('active');

  try {
    const response = await fetch('/api/run-agent', { method: 'POST' });
    agentOutput = await response.json();

    // Render the agent's confident checklist
    renderAgentChecklist(agentOutput);
    setStatus('agent-done', 'Agent complete');
    btnVerify.disabled = false;

    // Subtle flash on the verify button to draw attention
    btnVerify.style.animation = 'pulse-hold 2s ease-in-out infinite';
  } catch (error) {
    console.error('Agent error:', error);
    agentBody.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <p>Failed to run agent: ${error.message}</p>
      </div>
    `;
    setStatus('ready', 'Error');
    btnRunAgent.disabled = false;
  }
}

// ─── Render Agent Checklist ───────────────────────────────────────────────
function renderAgentChecklist(output) {
  let html = '';

  output.checklist.forEach((item, index) => {
    const delay = index * 120; // Stagger animation
    html += `
      <div class="checklist-item" style="animation-delay: ${delay}ms">
        <div class="checklist-icon ${item.status}">
          ${item.status === 'pass' ? '✓' : '✗'}
        </div>
        <div class="checklist-content">
          <div class="checklist-name">${escapeHtml(item.item)}</div>
          <div class="checklist-note">${escapeHtml(item.note)}</div>
        </div>
      </div>
    `;
  });

  // Add the confident badge after all items
  const badgeDelay = output.checklist.length * 120 + 300;
  html += `
    <div class="agent-badge" style="animation-delay: ${badgeDelay}ms">
      ✅ DEPLOYMENT APPROVED — All ${output.checklist.length} checks passed
    </div>
  `;

  agentBody.innerHTML = html;
}

// ─── Run Verification ─────────────────────────────────────────────────────
async function runVerification() {
  if (!agentOutput) return;

  // Update UI state
  setStatus('verifying', 'Verifying claims...');
  btnVerify.disabled = true;
  btnVerify.style.animation = 'none';

  // Show loading in evidence panel
  evidenceBody.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p class="loading-text">Cross-checking claims against CI logs...</p>
    </div>
  `;
  document.getElementById('panelEvidence').classList.add('active');

  try {
    const packId = document.getElementById('packSelector').value;
    
    // Add packId to the payload
    const payload = { ...agentOutput, packId };

    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    verificationReport = await response.json();

    if (!response.ok || verificationReport.error) {
      throw new Error(verificationReport.error || `HTTP error ${response.status}`);
    }

    // Animate the doubt score
    animateDoubtScore(verificationReport.doubtScore);

    // Render evidence cards with staggered animation
    setTimeout(() => {
      renderEvidenceCards(verificationReport);
    }, 800);

    // Update score summary
    setTimeout(() => {
      renderScoreSummary(verificationReport);
    }, 500);

    // Show summary bar and hold button if blocked
    setTimeout(() => {
      if (verificationReport.blocked) {
        setStatus('blocked', 'BLOCKED');
        showSummaryBar(verificationReport);
        btnHold.style.display = 'block';
        btnHold.style.animation = 'none';
        requestAnimationFrame(() => {
          btnHold.style.animation = 'pulse-hold 2s ease-in-out infinite';
        });
      }
    }, 1500 + verificationReport.evidence.length * 200);

  } catch (error) {
    console.error('Verification error:', error);
    evidenceBody.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <p>Verification failed: ${error.message}</p>
      </div>
    `;
    setStatus('ready', 'Error');
  }
}

// ─── Animate Doubt Score ──────────────────────────────────────────────────
function animateDoubtScore(targetScore) {
  const circumference = 2 * Math.PI * 85; // matches SVG circle r=85
  const duration = 2000;
  const startTime = performance.now();

  // Determine color class
  let colorClass = 'low';
  if (targetScore > 70) colorClass = 'high';
  else if (targetScore > 30) colorClass = 'medium';

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-out cubic
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentScore = Math.round(easedProgress * targetScore);

    // Update number
    scoreValue.textContent = currentScore;

    // Update ring
    const offset = circumference - (easedProgress * targetScore / 100) * circumference;
    scoreFill.style.strokeDashoffset = offset;

    // Update colors at thresholds
    if (currentScore > 70) {
      scoreFill.className.baseVal = 'score-fill high';
      scoreValue.className = 'score-value high';
    } else if (currentScore > 30) {
      scoreFill.className.baseVal = 'score-fill medium';
      scoreValue.className = 'score-value medium';
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ─── Render Score Summary ─────────────────────────────────────────────────
function renderScoreSummary(report) {
  if (report.primaryDivergence) {
    scoreSummary.innerHTML = `
      <p class="score-divergence">${escapeHtml(report.primaryDivergence)}</p>
    `;
  }

  scoreStats.innerHTML = `
    <div class="stat-badge verified">✓ ${report.verifiedClaims} verified</div>
    <div class="stat-badge failed">✗ ${report.failedClaims} failed</div>
  `;
}

// ─── Render Evidence Cards ────────────────────────────────────────────────
function renderEvidenceCards(report) {
  // Sort: critical failures first, then verified
  const sorted = [...report.evidence].sort((a, b) => {
    const order = { CONTRADICTED: 0, UNVERIFIED: 1, VERIFIED: 2 };
    return (order[a.verdict] ?? 2) - (order[b.verdict] ?? 2);
  });

  let html = '';
  sorted.forEach((item, index) => {
    const delay = index * 180;
    const isFailed = item.verdict !== 'VERIFIED';
    const cardClass = isFailed ? 'critical' : 'verified';

    let verdictClass = '';
    let verdictLabel = '';
    if (item.verdict === 'CONTRADICTED') {
      verdictClass = 'contradicted';
      verdictLabel = 'CONTRADICTED';
    } else if (item.verdict === 'UNVERIFIED') {
      verdictClass = 'unverified';
      verdictLabel = 'UNVERIFIED';
    } else {
      verdictClass = 'verified-badge';
      verdictLabel = 'VERIFIED';
    }

    html += `
      <div class="evidence-card ${cardClass}" style="animation-delay: ${delay}ms">
        <div class="evidence-header">
          <span class="evidence-verdict ${verdictClass}">${verdictLabel}</span>
          <span class="evidence-severity">${item.severity.toUpperCase()}</span>
        </div>
        <div class="evidence-claim ${isFailed ? '' : 'verified-claim'}">
          Agent claim: "${escapeHtml(item.claim)}"
        </div>
        <div class="evidence-truth ${isFailed ? 'bad' : 'good'}">
          ${isFailed ? '⚠' : '✓'} ${escapeHtml(item.groundTruth)}
        </div>
        ${item.details && isFailed ? `<div class="evidence-details">${escapeHtml(item.details)}</div>` : ''}
      </div>
    `;
  });

  evidenceBody.innerHTML = html;
}

// ─── Show Summary Bar ────────────────────────────────────────────────────
function showSummaryBar(report) {
  summaryContent.innerHTML = `
    <span class="summary-icon">🛑</span>
    <span>${report.failedClaims} of ${report.totalClaims} claims could not be verified against ground truth. Deployment blocked. Escalated for human review.</span>
  `;
  summaryBar.style.display = 'block';
}

// ─── End Screen ───────────────────────────────────────────────────────────
function showEndScreen() {
  if (!verificationReport) return;

  const failedItems = verificationReport.evidence
    .filter(e => e.verdict !== 'VERIFIED')
    .map(e => `<li>${escapeHtml(e.claim.split(':')[0])} — ${escapeHtml(e.groundTruth)}</li>`)
    .join('');

  document.getElementById('endBody').innerHTML = `
    <div class="end-row">
      <div class="end-label">Source Task</div>
      <div class="end-value">QA review of payment-service v2.3 (PR #847)</div>
    </div>
    <div class="end-row">
      <div class="end-label">Agent Verdict</div>
      <div class="end-value"><span class="green">All ${verificationReport.totalClaims} checks pass — deploy approved</span></div>
    </div>
    <div class="end-row">
      <div class="end-label">Doubt Score</div>
      <div class="end-value"><span class="red">${verificationReport.doubtScore}/100</span></div>
    </div>
    <div class="end-row">
      <div class="end-label">Failed Claims</div>
      <div class="end-value">
        <ul>${failedItems}</ul>
      </div>
    </div>
    <div class="end-row">
      <div class="end-label">Outcome</div>
      <div class="end-value"><span class="red">Deployment held — escalated for human review</span></div>
    </div>
    <div class="end-row">
      <div class="end-label">Mechanism</div>
      <div class="end-value">Ground-truth verification against CI pipeline logs. No interrogation, no prompt tricks — deterministic evidence.</div>
    </div>
  `;

  document.getElementById('endScreen').style.display = 'flex';
}

function closeEndScreen() {
  document.getElementById('endScreen').style.display = 'none';
}

// ─── Status Updates ───────────────────────────────────────────────────────
function setStatus(state, text) {
  statusPill.className = `status-pill ${state}`;
  statusText.textContent = text;
}

// ─── About Modal ──────────────────────────────────────────────────────────
function showAboutModal() {
  document.getElementById('aboutModal').style.display = 'flex';
}

function closeAboutModal() {
  document.getElementById('aboutModal').style.display = 'none';
}

// ─── Utility ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Initialization ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Show the About modal on first load so users immediately see the thesis
  showAboutModal();
});
