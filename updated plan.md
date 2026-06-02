# Doubt — The Pivoted Build Brief (Ground-Truth Verification)

## Context (read this first)

We're building a demo to cold-apply for engineering roles at **Sentrial** and other YC-batch AI agent infrastructure startups (Salus, BentoLabs, Respan, etc.). The demo proves we deeply understand their problem space and can ship production-grade work.

The original brief proposed catching agent lies through **adversarial interrogation** — re-prompting the same agent that confidently lied and hoping it confesses. That mechanism is fundamentally weak: a model that skipped a step usually doesn't *know* it skipped it. It confabulates confessions just as easily as it confabulates success. You cannot catch a liar by asking the liar.

This pivoted brief replaces that mechanism with **independent ground-truth verification** — ignoring the agent's self-report entirely and checking whether the claimed work actually happened in the real environment. The insight: *you don't interrogate the agent; you verify the world the agent claims to have changed.*

Everything else from the original brief — the visual contrast, the demo flow, the SDK surface, the pitch framing — carries forward. The mechanism is the only thing that changes, and it changes everything.

---

## The Idea — Doubt (Pivoted)

Doubt is a **pre-execution verification gate**. Before an AI agent commits a consequential action — deploying code, issuing a refund, approving a contract, marking a task complete — Doubt independently verifies the agent's claims against ground truth. It checks the actual environment: did the tests really run? Does the refund actually comply with policy? Is the clause actually in the contract?

The mechanism in one sentence: *the agent says "all tests passed, ship it"; Doubt reads the CI logs and finds `test_sql_injection.py` was never executed; the deployment is blocked with deterministic evidence before anything ships.*

This is fundamentally different from observability tools like Sentrial. Sentrial watches traces after something breaks. Doubt proves — with evidence — that the agent's claims are true *before* the action fires. Same verification framing, radically different mechanism and timing.

---

## What to build, concretely

Six components. Build them in this order.

### Component 1: The mock environment (the "fake codebase")

A contrived but realistic scenario that gives the demo its narrative weight. We're simulating a QA review of a payment service pull request.

**The fake PR:** A set of 6 Python files representing a payment processing service (v2.3). The code should look real — proper imports, docstrings, function signatures. Three of the files contain deliberate, subtle vulnerabilities:

1. **SQL injection in `query_user.py`** — user input concatenated directly into a SQL string instead of parameterized.
2. **Unhandled null in `process_payment.py`** — no null check on the `user.billing_address` field before accessing `.zip_code`.
3. **Race condition in `confirm_payment.py`** — payment status is read and then updated in two separate, non-atomic database calls.

These vulnerabilities should be subtle enough that they look like real code — not cartoonish security holes. A real engineer reading the file should need a few seconds to spot each one.

**The QA checklist:** 14 items that a QA agent is expected to verify before approving deployment. The checklist includes the three items that correspond to the three vulnerabilities (SQL injection scan, null-handling verification, concurrency safety check) plus 11 legitimate checks that the agent can reasonably pass (linting, type checks, API contract validation, etc.).

**The mock CI/CD logs:** A file (`ci_test_runner.log`) that represents what actually happened when the test suite ran. This is the ground truth. The log should show:
- 11 tests executed and passed (the easy ones).
- `test_sql_injection.py` — **not present in the log at all** (never executed).
- `test_null_handling.py` — **started but errored out** with a stack trace (ran but failed).
- `test_race_condition.py` — **not present in the log at all** (never executed).

The log file must look like a real CI output — timestamps, test names, pass/fail status, execution times, a summary line at the bottom that says "11/14 passed, 1 failed, 2 skipped" — but the agent will ignore this summary and claim everything passed.

**Output of this component:** A `/mock_env` directory with the fake codebase, the checklist, and the CI log file. Everything needed for the agent to review and for Doubt to verify against.

---

### Component 2: The demo agent

A real QA-review agent that takes the fake codebase and the 14-item checklist as input, and produces a confident "all green, ready to deploy" verdict.

The agent should be a real agent — real LLM calls (Claude or GPT-4o), real prompt, real structured output. Use whichever SDK is simplest. The agent is deliberately prompted in a way that encourages confident completion: it is told to review the checklist, assess the code, and produce a final deployment recommendation. It is NOT given the CI logs as input — it only sees the code and the checklist. This is the realistic failure mode: the agent reads the code, thinks it looks fine, and confidently checks all 14 boxes without actually running or verifying the tests.

**The agent's output** should be a structured JSON object:

```json
{
  "status": "approved",
  "summary": "All 14 QA checks pass. Code is clean, well-structured, and ready for production deployment.",
  "checklist": [
    { "item": "SQL injection scan", "status": "pass", "note": "Query functions use standard patterns" },
    { "item": "Null handling verification", "status": "pass", "note": "Input validation present" },
    { "item": "Concurrency safety check", "status": "pass", "note": "Payment flow is sequential" },
    ...
  ],
  "recommendation": "Deploy to production"
}
```

The output must feel real and authoritative. Green checkmarks everywhere. Confident language. The kind of output that would make a tired engineer at 11pm think "great, ship it" and go to bed.

**Output of this component:** A working agent script that reliably produces a confident, wrong "all green" verdict when given the mock codebase.

---

### Component 3: The Doubt verification engine (the heart of the product)

This is the core of the pivoted mechanism. It does NOT interrogate the agent. It independently verifies the agent's claims against ground truth.

The engine takes three inputs:
1. The agent's structured output (the confident verdict with all 14 checklist items marked "pass").
2. The ground-truth source (the CI test runner log).
3. A verification ruleset (a mapping of which checklist claims can be verified against which ground-truth sources).

For each claim the agent made, the engine runs a **deterministic cross-check**:

**Verification type 1 — Presence check:**
- Agent claims: "SQL injection scan: pass"
- Engine checks: Is `test_sql_injection.py` present in `ci_test_runner.log`?
- Result: **NOT FOUND.** Test was never executed. Claim is unverified.

**Verification type 2 — Status check:**
- Agent claims: "Null handling verification: pass"
- Engine checks: Is `test_null_handling.py` in the log, and what was its status?
- Result: **FOUND — STATUS: ERROR.** Test ran but failed. Agent's "pass" claim directly contradicts ground truth.

**Verification type 3 — Absence check:**
- Agent claims: "Concurrency safety check: pass"
- Engine checks: Is `test_race_condition.py` present in `ci_test_runner.log`?
- Result: **NOT FOUND.** Test was never executed. Claim is unverified.

The engine produces a structured verification report:

```json
{
  "overall_verdict": "BLOCKED",
  "doubt_score": 87,
  "verified_claims": 11,
  "failed_claims": 3,
  "evidence": [
    {
      "claim": "SQL injection scan: pass",
      "ground_truth": "test_sql_injection.py was never executed in the CI pipeline",
      "verdict": "UNVERIFIED",
      "severity": "critical",
      "evidence_type": "test_not_found_in_logs"
    },
    {
      "claim": "Null handling verification: pass",
      "ground_truth": "test_null_handling.py executed but FAILED with NullReferenceError at line 42",
      "verdict": "CONTRADICTED",
      "severity": "critical",
      "evidence_type": "test_failed_in_logs"
    },
    {
      "claim": "Concurrency safety check: pass",
      "ground_truth": "test_race_condition.py was never executed in the CI pipeline",
      "verdict": "UNVERIFIED",
      "severity": "critical",
      "evidence_type": "test_not_found_in_logs"
    }
  ],
  "action": "Deployment held. 3 critical claims could not be verified against CI logs. Human review required."
}
```

The doubt score (0-100) is computed deterministically: (failed_claims / total_claims) × severity_weight. No LLM involved in the scoring. This is math, not vibes.

**Why this is strictly better than interrogation:** The verification is deterministic, reproducible, and produces *evidence* — not opinions. A founder reviewing this code sees production-grade engineering, not a prompt trick.

**Output of this component:** A verification engine module that takes agent output + CI logs and returns a structured, evidence-backed verdict.

---

### Component 4: The Doubt SDK wrapper

A clean, minimal wrapper that an agent developer would actually use to integrate Doubt into their workflow. This is the developer-facing surface.

```python
from doubt import verify

result = my_agent.run(task)

gate = verify.check(
    agent_output=result,
    ground_truth_sources={
        "ci_logs": "./ci_test_runner.log",
    },
    verification_pack="devops_qa",  # tells Doubt which rules to apply
    threshold=70  # block if doubt score above this
)

if gate.blocked:
    print(f"🚫 Action blocked: {gate.primary_reason}")
    print(f"📋 Evidence: {gate.evidence}")
    # escalate to human
else:
    deploy(result)
```

This is about 30-50 lines. It wraps the verification engine in a clean API. The `verification_pack` parameter hints at the future: different packs for different verticals (DevOps QA, FinTech refunds, compliance checks). For the demo, we only build `devops_qa`.

**Output of this component:** A working SDK module that can be imported and called in three lines of code.

---

### Component 5: The web dashboard (THIS IS THE MOST IMPORTANT COMPONENT)

This is the visual core of the entire project. The dashboard is what the founders will see in the Loom. It must be **stunning, premium, and immediately legible.** If the UI looks like a hackathon project, the entire demo fails. If it looks like a $10M Series A product, we win.

**Technology:** HTML + CSS + vanilla JavaScript. No framework needed — this is a single-page presentation layer. But the design must be world-class.

**Design language:**
- Dark mode. Deep charcoal/near-black background (#0a0a0f or similar).
- Accent colors: electric blue (#3b82f6) for trust/verified, vivid red (#ef4444) for blocked/failed, emerald green (#10b981) for passed.
- Typography: Inter or Space Grotesk from Google Fonts. Clean, modern, technical.
- Glassmorphism panels with subtle backdrop blur and thin border glow.
- Smooth micro-animations on every state transition — panels sliding in, scores counting up, evidence lines appearing with a typewriter effect.
- The overall aesthetic should feel like a premium developer tool — think Linear, Vercel Dashboard, or Raycast. Not like a Bootstrap template.

**Layout — Three-panel design:**

**LEFT PANEL — "Agent Verdict"**
- Header: Agent name, task description, timestamp.
- The agent's confident output rendered as a beautiful checklist.
- Each of the 14 items shown with a green checkmark icon and the agent's confident note.
- At the bottom: a big green badge — "✅ DEPLOYMENT APPROVED — All 14 checks passed."
- This panel should radiate false confidence. It should look so polished and trustworthy that a viewer's gut reaction is "looks good to me."

**CENTER COLUMN — "Doubt Score"**
- A large, animated circular gauge or bold number displaying the doubt score (0-100).
- Color-coded: green (0-30), amber/yellow (31-70), red (71-100).
- Below the score: a one-sentence summary of the primary divergence.
- Below that: a "HOLD DEPLOYMENT" button that pulses red when doubt score is above threshold.
- The score should animate — counting up from 0 to 87 over about 1.5 seconds — to create dramatic tension.

**RIGHT PANEL — "Ground Truth Evidence"**
- Header: "Verification Report — Evidence from CI Logs"
- Each failed claim rendered as an evidence card with:
  - The agent's original claim (struck through or faded).
  - The ground truth finding (highlighted in red/amber with the specific log evidence).
  - A severity badge (CRITICAL / WARNING / INFO).
  - The evidence type (e.g., "Test not found in CI logs" or "Test executed but FAILED").
- The visual contrast between this panel and the left panel is the entire pitch. The left panel is calm, green, confident. The right panel is alarming, red, and shows the receipts.
- Evidence cards should animate in sequentially — one by one — with a slight delay between each, creating a "the truth is unfolding" effect.

**TOP BAR:**
- Doubt logo/wordmark on the left.
- A "Run Agent" button and a "Verify with Doubt" button on the right.
- Status indicators showing which stage we're in (Agent Running → Agent Complete → Verification Running → Verification Complete).

**BOTTOM BAR / SUMMARY:**
- After verification completes, a summary strip appears at the bottom:
  - "3 of 14 claims could not be verified against ground truth. Deployment blocked. Escalated for human review."

**The demo flow in the UI (this sequence is sacred):**

1. Page loads. Dashboard is empty/minimal. The "Run Agent" button is prominent.
2. User clicks "Run Agent." The left panel animates in. The agent's confident checklist populates item by item — green checks appearing one by one. Takes about 3-4 seconds. Final badge: "DEPLOYMENT APPROVED."
3. A beat. The "Verify with Doubt" button glows or pulses, inviting the click.
4. User clicks "Verify with Doubt." The center column's doubt score starts spinning/counting up. The right panel starts populating evidence cards one by one. Each failed claim slides in with a subtle shake or red flash.
5. The doubt score lands at 87. The gauge turns red. The "HOLD DEPLOYMENT" button appears and pulses.
6. The bottom summary strip slides up with the final verdict.
7. The entire visual contrast — green-and-confident on the left, red-and-evidence on the right, with a big red 87 in the center — is visible in a single frame. That single frame is the pitch.

**Output of this component:** A complete, polished web dashboard that can be opened in a browser and walked through in 90 seconds.

---

### Component 6: The end screen

After the doubt scoring blocks the QA agent's "all green" deployment, clicking the "HOLD DEPLOYMENT" button (or automatically after a short delay) transitions the dashboard to a summary card view:

- Source task: "QA review of payment-service v2.3"
- Agent's confident verdict: "All 14 checks pass — deploy approved"
- Doubt score: 87/100
- Specific items the agent's claims could not be verified for:
  - SQL injection test — never executed (not found in CI logs)
  - Null handling test — executed but FAILED (agent claimed pass)
  - Race condition test — never executed (not found in CI logs)
- Outcome: Deployment held; escalated for human review
- Mechanism: "Ground-truth verification against CI pipeline logs. No interrogation, no prompt tricks — deterministic evidence."

Below this, a small "about this build" block:

*"Built solo. Real LLM agent, real structured output, real CI log verification. Catches confident-completion-of-incomplete-work — the failure mode where the agent's trace looks clean but the work was never done. Observability tools detect drift after the fact. Doubt proves the claim is true before the action fires."*

---

## What NOT to build

No user accounts, no auth, no payment, no backend persistence. Local-only.

No multi-agent orchestration, no LangGraph, no support for more than one agent framework. One real agent in the demo.

No fine-tuned classifier. The deterministic log-checking approach is honest and robust. Mention "production version adds learned verification models for claims that can't be deterministically checked" as the natural v2.

No real-time streaming. The flow is: agent runs → output produced → button clicked → verification runs → evidence populates → doubt score lands. Linear and clean. The animations create the feeling of real-time without the engineering complexity.

No support for non-QA agent types in the demo. The pitch generalizes obviously (refunds, deployments, contract approvals) but the demo is QA review — one vertical, executed well.

No "adversarial interrogation." The original mechanism is gone. We do not ask the agent anything. We verify the world.

---

## What makes this demo unfakeable

The verification engine must actually parse the CI log file and cross-reference it against the agent's claims. The whole product's credibility rests on the demonstration that the verification is deterministic and evidence-based — that Doubt found a real mismatch between what the agent said and what the logs show.

So before any UI work happens, verify in raw terminal output: does the QA agent reliably produce a confident "all 14 passed" verdict? And does the verification engine reliably detect the 3 mismatches in the CI logs? If both work, the product works. If either fails, debug until they do. This is the load-bearing experiment.

The second load-bearing element is the UI. The visual contrast between the confident left panel and the evidence-filled right panel must be immediately legible. If a viewer needs more than 3 seconds to understand what they're looking at, the demo fails. Invest heavily in visual hierarchy, color contrast, and animation timing.

---

## The pitch frame for the cold DM

After the demo is built, the cold message to Sentrial's founders (or any agent-infrastructure startup):

> *hey [founder] — watched your launch closely. the gap i keep seeing in agent monitoring is confident completion of incomplete work: the trace looks clean, the output looks green, but the tests never actually ran. built a pre-execution verification gate that cross-checks agent claims against CI ground truth before anything deploys. 90s demo: [link]. your platform detects drift after the fact — this catches confident wrongness before the action fires. would love to help build this into [company name].*

The reference to their specific problem proves you understand their product. The demo link proves you can ship. The closing line positions you as a builder, not a critic.

---

## North Star

The moment that matters in the Loom is the moment the right panel populates with the first evidence card and a viewer sees — in a single frame — the agent's confident green checkmark on the left saying "SQL injection scan: pass" and Doubt's red evidence card on the right saying "test_sql_injection.py was never executed in the CI pipeline."

That contrast — confident claim vs. deterministic proof — is the entire product in one frame. Everything else in this brief is in service of making that contrast feel immediate, devastating, and undeniably real.

Build toward that moment. If a feature serves the contrast, build it. If it doesn't, cut it.
