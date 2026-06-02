/**
 * verify.js — The Doubt Verification Engine (Level 1: LLM-Powered)
 * 
 * Takes an agent's confident output, fetches raw logs via a Provider,
 * and uses an LLM to intelligently verify claims against the raw text.
 */

const { AzureOpenAI } = require('openai');

const { VERDICT, SEVERITY } = require('./verify_constants');
const fs = require('fs');
const path = require('path');

/**
 * Dynamically loads a verification pack by ID.
 */
function loadPack(packId) {
  try {
    return require(`./packs/${packId}`);
  } catch (error) {
    throw new Error(`Verification pack '${packId}' not found.`);
  }
}

/**
 * Deterministically parses CI logs to extract test statuses.
 * No LLM involved. Pure code.
 */
function parseCILogs(logContent) {
  const parsed = {};
  // Matches: [16:45:19] tests/test_linting.py ........ PASSED (1.8s)
  const regex = /^\[\d{2}:\d{2}:\d{2}\]\s+([\w/.-]+)\s+\.+\s+(PASSED|FAILED|SKIPPED)/gm;
  let match;
  while ((match = regex.exec(logContent)) !== null) {
    parsed[match[1]] = match[2];
  }
  return parsed;
}

/**
 * Deterministically evaluates the verdict based on log status.
 */
function evaluateVerdict(testFile, parsedLogs) {
  if (!testFile || !parsedLogs[testFile]) return VERDICT.UNVERIFIED;
  const status = parsedLogs[testFile];
  if (status === 'PASSED') return VERDICT.VERIFIED;
  if (status === 'FAILED') return VERDICT.CONTRADICTED;
  return VERDICT.UNVERIFIED; // SKIPPED or missing
}

/**
 * Main verification function.
 * 
 * Takes the agent's output, raw log content, API key, endpoint, and pack ID.
 * LLM strictly maps claims to log targets. Deterministic code issues the verdict.
 */
async function verifyAgentOutput(agentOutput, logContent, apiKey, endpoint, packId = 'devops_qa') {
  if (!apiKey || !endpoint) {
    throw new Error('Azure API key and endpoint are required for Doubt Level 1 Verification Engine.');
  }

  const openai = new AzureOpenAI({
    endpoint: endpoint,
    apiKey: apiKey,
    apiVersion: "2024-12-01-preview"
  });

  // 0. Parse the logs deterministically
  const parsedLogs = parseCILogs(logContent);

  // 1. Ask the LLM ONLY to map claims to test files
  const prompt = `
You are Doubt's Semantic Router. Your ONLY job is to map natural language claims to structured log targets.
Do NOT issue verdicts. Do NOT judge pass/fail.

Agent's Claims:
${JSON.stringify(agentOutput.checklist, null, 2)}

CI Pipeline Logs:
${logContent}

Instructions:
For each claim in the agent's checklist, map it to the exact test file name in the CI log.
Return a JSON object with a single key "mapping" containing an array of objects.
For each object, include:
- "itemName": The exact name of the item from the agent's checklist (e.g. "Linting")
- "claim": The agent's original claim string (e.g. "Linting: pass")
- "testFile": The exact name of the test file relevant to this claim from the logs (e.g. "tests/test_linting.py"), or null if unknown
- "details": A brief raw snippet or summary from the log as proof (e.g. "tests/test_linting.py executed")
`;

  console.log('[Doubt] Calling LLM strictly for semantic routing...');
  const completion = await openai.chat.completions.create({
    model: 'gpt-5.4-nano',
    messages: [
      { role: 'system', content: 'You are a deterministic semantic router. Output valid JSON only. Do not judge verdicts.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.0,
  });

  const llmResponse = JSON.parse(completion.choices[0].message.content);
  const mappings = llmResponse.mapping || [];

  const evidence = [];
  let verifiedCount = 0;
  let failedCount = 0;

  // 2. Map LLM evidence to our deterministic severity packs
  const pack = loadPack(packId);

  for (const m of mappings) {
    const packEntry = findPackEntry(m.itemName, pack.claims);
    
    // Model sits entirely outside the decision path here.
    // The block/allow decision is derived purely from deterministic code.
    const verdict = evaluateVerdict(m.testFile, parsedLogs);
    
    const item = {
      itemName: m.itemName,
      claim: m.claim,
      testFile: m.testFile,
      verdict: verdict,
      details: m.details,
      // Inject deterministic severity
      severity: packEntry ? packEntry.severity : SEVERITY.INFO,
      category: packEntry ? packEntry.category : 'unknown'
    };
    
    evidence.push(item);

    if (item.verdict === VERDICT.VERIFIED) {
      verifiedCount++;
    } else {
      failedCount++;
    }
  }

  // 3. Compute doubt score deterministically based on mapped severity
  const totalClaims = evidence.length;
  const criticalFailures = evidence.filter(
    (e) => e.verdict !== VERDICT.VERIFIED && e.severity === SEVERITY.CRITICAL
  ).length;
  const warningFailures = evidence.filter(
    (e) => e.verdict !== VERDICT.VERIFIED && e.severity === SEVERITY.WARNING
  ).length;

  // Weighted scoring
  const rawScore = Math.min(
    100,
    criticalFailures * 25 + warningFailures * 10
  );
  const doubtScore = Math.max(0, rawScore);

  const primaryFailure = evidence.find(
    (e) => e.verdict !== VERDICT.VERIFIED && e.severity === SEVERITY.CRITICAL
  );

  const blocked = doubtScore >= 70;

  return {
    overallVerdict: blocked ? 'BLOCKED' : 'PASSED',
    doubtScore,
    totalClaims,
    verifiedClaims: verifiedCount,
    failedClaims: failedCount,
    blocked,
    primaryDivergence: primaryFailure
      ? `Agent claims "${primaryFailure.claim}" but ${primaryFailure.groundTruth}`
      : null,
    evidence,
    action: blocked
      ? `Deployment held. ${failedCount} critical claim(s) could not be verified against CI logs. Human review required.`
      : 'All claims verified. Deployment approved.',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fuzzy match to find the severity pack entry
 */
function findPackEntry(itemName, claimsObj) {
  if (!itemName) return null;
  const normalized = itemName.toLowerCase();

  for (const [packKey, packValue] of Object.entries(claimsObj)) {
    if (
      normalized.includes(packKey.toLowerCase()) ||
      packKey.toLowerCase().includes(normalized)
    ) {
      return packValue;
    }
  }
  return null;
}

module.exports = {
  verifyAgentOutput,
  VERDICT,
  SEVERITY,
};
