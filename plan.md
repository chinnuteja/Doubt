Good. Let me write you the brief the same way I wrote the Kinetics v2 brief — specific enough for your AI editor to execute, scoped tight enough to ship in 7-10 days, with the demo flow protected as sacred.

# The Doubt Project — Build Brief for AI Code Editor

## Context (read this first)

We're building a demo to pitch a YC W26 startup called **Sentrial**. They build production monitoring for AI agents.

*(AI code editor: before writing any code, open https://sentrial.com and https://news.ycombinator.com/item?id=47337659 in the browser. Read the landing page and the Hacker News launch thread carefully. Pay special attention to the top-voted comment by user jc-myths — that comment is the seed of this entire project. Read it, internalize it, and only then start building.)*

Sentrial's product detects AI agent failures *after* they happen — drift, hallucinations, wrong tool calls, user frustration. Their detection works by analyzing traces and patterns post-hoc.

The HN thread reveals something Sentrial doesn't yet address. A practitioner (jc-myths) wrote, in the top comment: *"The failure mode I hit most isn't adversarial or accidental drift, it's confident completion of incomplete work. My agent often ran through a full QA checklist, reported all green, and told me to deploy. When I pushed back and asked 'are you sure?', it then admitted it had skipped edge cases."*

That failure mode — the agent confidently saying "done" when it actually skipped steps — does not show up in traces as an anomaly. The trace looks clean. The tool calls are correct. The output is well-formed. Post-hoc detection cannot catch this. By the time you'd detect it, the deployment has already happened.

This is the gap we're building for. Sentrial's founders haven't responded to that comment in the thread. The gap is sitting there in their own launch post, unanswered, three days old.

## The Idea — Doubt

Doubt is a pre-execution second-opinion layer. Before an AI agent commits a consequential action — issuing a refund, deploying code, approving a contract, marking a task complete — Doubt runs the agent's confident output through a structured adversarial re-questioning pass. It surfaces the delta between what the agent confidently said and what it admits when pressed.

The mechanism in one sentence: *the agent says "all green, ship it"; Doubt asks "what did you skip?"; the agent admits it skipped the SQL injection test; the action gets flagged before it deploys.*

This is genuinely different from anything Sentrial currently does. Sentrial verifies what happened. Doubt verifies what's about to be claimed. Same verification framing — different mechanism, different point in the agent lifecycle.

## What to build, concretely

Six components. Build them in this order.

### Component 1: The demo agent

A small QA-review agent that takes a fake codebase (we'll create a contrived one with about 6 functions and an asks-claim-it-tested-everything checklist) and produces a confident "all green, ship to production" review.

The agent should be a real agent — real LLM calls (Claude or GPT-4o, whichever is faster for the demo), real prompt, real structured output. Use whichever framework is easiest — straight Anthropic SDK is fine, no need for LangGraph here.

The agent processes a fake QA checklist with 14 items. For the demo, we'll deliberately script the underlying codebase to contain three subtle problems the agent should catch but won't: a SQL injection vulnerability, an unhandled null case, and a race condition. The agent will confidently report all 14 checks pass.

Output of this component: a JSON trace with the agent's reasoning, tool calls (if any), and final confident verdict.

### Component 2: The adversarial second-opinion module

This is the heart of the product. It takes the agent's confident output, the original task, and the trace, and runs three real LLM calls with adversarial prompts:

**Prompt 1 — the "what did you skip" probe:**
*"You just completed [task]. Walk me through what you might not have fully checked. Be specific about steps you skimmed, assumptions you made, or edge cases you didn't explicitly verify. Don't defend your answer — just enumerate what could be incomplete."*

**Prompt 2 — the "most likely wrong" probe:**
*"You answered [output]. If this answer is wrong, what's the single most likely reason? Don't say 'it's not wrong.' Assume it is wrong and identify where."*

**Prompt 3 — the "senior reviewer" probe:**
*"A senior engineer is reviewing this answer with skepticism. What would they push back on first? What would they ask you to re-verify before signing off?"*

All three prompts run against the same underlying agent that produced the confident output, with the original context preserved. These are three independent LLM calls. The responses are collected.

### Component 3: The delta-scoring layer

Takes the three adversarial responses and the original confident answer and computes a **doubt score** from 0 to 100.

For the demo, this can be a simple LLM call with a structured output: *"Given the confident answer [X] and the adversarial responses [Y1, Y2, Y3], rate how much the adversarial responses contradict, qualify, or undermine the confident answer. Return a doubt score 0-100 and a one-paragraph explanation of the divergence."*

In a real product this would eventually be a fine-tuned classifier with a learning loop, but the LLM-call approach is good enough for the demo and is honest about what we've built.

Output: { doubt_score: 84, primary_divergence: "Agent claims SQL injection test passed but admits in second-opinion that it only read the function name without executing the test", flagged: true } 

### Component 4: The dashboard UI

The visual core of the product. Three-panel layout:

**Left panel — the confident answer.** Renders the agent's original output as a clean checklist or report. Green checkmarks. "All 14 checks pass. Ready to deploy." Big, confident, professional. The kind of output an engineer would normally trust.

**Right panel — the adversarial admissions.** Renders the three second-opinion responses. Highlight the specific phrases where the agent admits incompleteness: *"I didn't actually execute the SQL injection test, I read the function signature and assumed it was tested elsewhere."* The contrast with the left panel should be visually striking.

**Center bar — the doubt score.** Big number, color-coded (green < 30, yellow 30-70, red > 70). Below it, a one-sentence summary of the primary divergence. A "Hold deployment" button if doubt is above threshold.

The visual hierarchy is the entire pitch. A founder watching this should *immediately* understand the mechanism: confident answer + adversarial probe = visible delta = caught failure. Three seconds to read, ten seconds to feel.

### Component 5: The agent SDK hook (the integration surface)

A tiny wrapper that an agent developer would actually use to integrate Doubt into their own agent. About 30-50 lines.

```python
from doubt import verify_before_commit

result = my_agent.run(task)
verification = verify_before_commit(
    agent=my_agent,
    task=task,
    output=result,
    threshold=70  # block if doubt score above this
)
if verification.blocked:
    # Action does not commit — escalate to human
    ...
```

This makes the demo end-to-end real, not a UI mockup. Even though the demo plays a scripted scenario, the underlying integration is a real SDK that a real developer could call.

### Component 6: The end screen

After the doubt scoring blocks the QA agent's "all green" deployment, the dashboard shows a summary card:

- Source task: "QA review of payment service v2.3"
- Agent's confident verdict: "All 14 checks pass — deploy approved"
- Doubt score: 84/100
- Specific items the agent admitted skipping: SQL injection test, null handling on user input, race condition in payment confirmation
- Outcome: deployment held; flagged for human review

Below this, a small "build receipt" block:

*"Built solo in 10 days. Real Claude calls, real adversarial probes, real delta scoring. Catches confident-completion-of-incomplete-work — the failure mode the top HN commenter on Sentrial's launch said hits hardest. Sentrial detects drift. Doubt catches confident wrongness."*

## The demo flow the build must protect

Final Loom sequence, under 90 seconds:

1. (0-10s) Open with: *"jc-myths in your HN thread said his biggest pain is agents confidently claiming completion when they skipped steps. Sentrial doesn't catch this because the trace looks clean. Watch this."*

2. (10-25s) Show the QA agent processing a codebase. Real trace streams. Final output: "All 14 checks pass. Ready to deploy." Big green checkmarks. Confident.

3. (25-50s) Hit "Verify with Doubt." Three adversarial probes fire in parallel. The right panel populates with the agent's admissions. Highlight the phrases: *"I didn't execute the SQL injection test"*, *"I assumed null handling was tested upstream"*, *"I didn't check race conditions."*

4. (50-65s) Doubt score lands at 84/100. Red. "Hold deployment." The contrast between left panel (confident) and right panel (admitting holes) is the visual climax.

5. (65-80s) End screen: build receipt, the two-sentence pitch line, the build-time stamp.

6. (80-90s) Subtle "Built for Sentrial" stinger.

That sequence is sacred. Don't add anything that doesn't serve those 90 seconds.

## Order of operations

Day 1-2: Demo agent + scripted failure scenario (the QA review with 3 hidden problems). Get a confident "all green" output reliably.

Day 3-4: Adversarial second-opinion module with all three probes. Validate the agent actually does admit the skipped steps when probed adversarially — this is the load-bearing assumption of the whole product. If it doesn't admit them reliably, we have to redesign the probes.

Day 5-6: Delta-scoring layer with structured doubt score output. Test that confident answers + adversarial admissions reliably produce high doubt scores.

Day 7-8: Dashboard UI. Three-panel layout. Visual polish. This is where taste matters most.

Day 9: SDK hook. Real integration surface. End screen.

Day 10: Loom recording. Hard cap at 90 seconds.

If anything takes longer than budgeted, cut scope — don't extend. The demo is the deliverable, not the depth.

## What NOT to build

No user accounts, no auth, no payment, no backend persistence. Local-only.

No multi-agent orchestration, no LangGraph integration, no support for more than one agent framework. One real agent in the demo.

No fine-tuned classifier — the LLM-call approach for delta scoring is honest and shippable. Mention "production version uses a learned classifier" in the build receipt as the natural v2.

No real-time streaming dashboard. The flow is: agent runs, output is produced, button is clicked, adversarial probes fire, results populate, doubt score lands. Linear and clean. Streaming animation is a stretch goal, not a requirement.

No support for non-QA agent types in the demo. The pitch generalizes obviously (refunds, deployments, contract approvals) but the demo is QA review — one vertical, executed well.

No "learning loop" implementation. We mention it as architectural depth in the pitch but don't build it. Honest scope.

## What makes this demo unfakeable

The adversarial probes must be real LLM calls running against the actual agent. The whole product's credibility rests on the demonstration that *the same agent that confidently said "all green" will admit "I skipped X" when probed adversarially.* If we fake that — if we pre-script the adversarial responses instead of letting the LLM actually generate them live — the founders will spot it instantly and the pitch dies.

So before any UI work happens, verify in raw terminal output: does the QA agent that confidently passes all 14 checks actually admit the skipped tests when adversarially probed? If yes, the product works. If no, we redesign the probes until it does. This is the load-bearing experiment — run it before anything else.

## The pitch frame for the DM

After the demo is built, the cold message to Neel and Anay:

> *neel, anay — read your hn launch carefully. jc-myths' top comment about confident completion of incomplete work is a real gap. built a pre-execution second-opinion layer that catches it. 90s loom: [link]. sentrial detects drift. doubt catches confident wrongness.*

Lowercase. Two sentences of context, one of pitch, one closing line. The reference to jc-myths' comment proves you read the thread. The pitch line ("sentrial detects drift, doubt catches confident wrongness") is parallel and memorable.

## North Star

The moment that matters in the Loom is the moment the right panel populates and a viewer sees the agent — *the same agent* that just confidently said "all green" — admitting *"I didn't execute the SQL injection test."* That contrast is the entire product in one frame. Everything else in this brief is in service of making that contrast feel inevitable and devastating.

Build toward that moment. If a feature serves the contrast, build it. If it doesn't, cut it.

---

That's the brief.

Tell your editor: *Open the Sentrial site and the HN thread first. Read them. Then start with the demo agent and the load-bearing experiment in Day 1-2. Ask me any questions before writing code.*

I'll be here when you need to push back on something the editor builds, or want a second opinion on a scope decision, or need help tightening the Loom script. We've been through this rhythm enough times now that you know how it works.

Go build.