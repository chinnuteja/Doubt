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
 * Main verification function.
 * 
 * Takes the agent's output, raw log content, API key, endpoint, and pack ID.
 * Cross-checks every claim intelligently using an LLM.
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

  // 1. Ask the LLM to cross-check claims against the logs
  const prompt = `
You are Doubt, an objective verification engine.
Your task is to cross-check an AI agent's claims about a code review against the actual raw CI pipeline logs.

Agent's Claims:
${JSON.stringify(agentOutput.checklist, null, 2)}

CI Pipeline Logs:
${logContent}

Instructions:
For each claim in the agent's checklist, determine if the log supports it, contradicts it, or if there's no evidence/the test was skipped.
Return a JSON object with a single key "evidence" containing an array of objects.
For each object, include:
- "itemName": The exact name of the item from the agent's checklist (e.g. "Linting")
- "claim": The agent's original claim string (e.g. "Linting: pass")
- "testFile": The name of the test file relevant to this claim from the logs (e.g. "test_linting.py"), or null if unknown
- "groundTruth": A concise sentence stating what the log actually says happened (e.g. "test_linting.py executed and PASSED")
- "verdict": Exactly one of "VERIFIED" (log proves claim), "CONTRADICTED" (log proves claim is false), or "UNVERIFIED" (log has no evidence / test was skipped / test not found).
- "details": A brief raw snippet or summary from the log as proof (do not hallucinate, use exact substrings from the log if possible).
`;

  console.log('[Doubt] Calling LLM to parse and verify logs...');
  const completion = await openai.chat.completions.create({
    model: 'gpt-5.4-nano',
    messages: [
      { role: 'system', content: 'You are a deterministic, objective log verification engine. Output valid JSON only.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.0,
  });

  const llmResponse = JSON.parse(completion.choices[0].message.content);
  const rawEvidence = llmResponse.evidence || [];

  const evidence = [];
  let verifiedCount = 0;
  let failedCount = 0;

  // 2. Map LLM evidence to our deterministic severity packs
  const pack = loadPack(packId);

  for (const item of rawEvidence) {
    const packEntry = findPackEntry(item.itemName, pack.claims);
    
    // Inject deterministic severity
    item.severity = packEntry ? packEntry.severity : SEVERITY.INFO;
    item.category = packEntry ? packEntry.category : 'unknown';
    
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
