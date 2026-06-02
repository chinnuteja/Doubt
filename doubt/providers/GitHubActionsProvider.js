const LogProvider = require('./LogProvider');
const fs = require('fs');
const path = require('path');

/**
 * Level 2: GitHub Actions Integration
 * Fetches logs from a real GitHub Actions workflow run.
 */
class GitHubActionsProvider extends LogProvider {
  constructor(apiToken) {
    super();
    this.apiToken = apiToken;
  }

  /**
   * @param {Object} context
   * @param {string} context.owner - GitHub repo owner
   * @param {string} context.repo - GitHub repo name
   * @param {string} context.runId - GitHub Actions run ID
   */
  async fetchLogs(context) {
    const { owner, repo, runId } = context;

    if (!owner || !repo) {
      console.log('[Provider] No GitHub repo provided, falling back to local mock logs...');
      // Fallback to local logs for the demo if no real repo is provided
      return fs.readFileSync(path.join(__dirname, '../../mock_env/ci_test_runner.log'), 'utf-8');
    }

    if (!this.apiToken) {
      throw new Error('GitHub API token is required to fetch real logs from GitHub Actions.');
    }

    console.log(`[Provider] Fetching jobs for ${owner}/${repo} run ${runId}...`);
    
    // 1. Fetch jobs for the run
    const jobsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${this.apiToken}`
      }
    });

    if (!jobsResponse.ok) {
      throw new Error(`Failed to fetch jobs from GitHub: ${jobsResponse.statusText}`);
    }

    const jobsData = await jobsResponse.json();
    if (jobsData.jobs.length === 0) {
      throw new Error('No jobs found for this run ID.');
    }

    // 2. Fetch logs for the first job (usually the build/test job)
    const jobId = jobsData.jobs[0].id;
    console.log(`[Provider] Fetching raw logs for job ${jobId}...`);

    const logsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
      headers: {
        'Authorization': `token ${this.apiToken}`
      }
    });

    if (!logsResponse.ok) {
      throw new Error(`Failed to fetch logs from GitHub: ${logsResponse.statusText}`);
    }

    const logText = await logsResponse.text();
    return logText;
  }
}

module.exports = GitHubActionsProvider;
