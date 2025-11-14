const Logger = require("pizza-logger");
const config = require("./config.js");

let logger;
try {
  // prefer a logger-specific config block if present
  logger = new Logger(config.logger ?? config);
} catch (e) {
  // Fallback no-op logger so app/tests don't crash if pizza-logger misconfigures
  console.error("pizza-logger init failed, using noop logger:", e);
  logger = {
    httpLogger: (req, res, next) => next(),
    dbLogger: () => {},
    factoryLogger: () => {},
    unhandledErrorLogger: () => {},
  };
}

module.exports = logger;
