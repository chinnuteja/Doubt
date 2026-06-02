/**
 * Base LogProvider class.
 * All providers must implement the fetchLogs method.
 */
class LogProvider {
  /**
   * Fetch logs for a given context.
   * @param {Object} context - The context required to fetch logs (e.g. repo, run_id, or filePath)
   * @returns {Promise<string>} - The raw log content as a string
   */
  async fetchLogs(context) {
    throw new Error('fetchLogs() must be implemented by the provider');
  }
}

module.exports = LogProvider;
