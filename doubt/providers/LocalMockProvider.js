const fs = require('fs');
const LogProvider = require('./LogProvider');

/**
 * LocalMockProvider reads logs from a local file.
 * Used for demo environments and testing.
 */
class LocalMockProvider extends LogProvider {
  /**
   * @param {Object} context
   * @param {string} context.filePath - Absolute path to the local log file
   */
  async fetchLogs(context) {
    if (!context || !context.filePath) {
      throw new Error('LocalMockProvider requires context.filePath');
    }
    
    return fs.readFileSync(context.filePath, 'utf-8');
  }
}

module.exports = LocalMockProvider;
