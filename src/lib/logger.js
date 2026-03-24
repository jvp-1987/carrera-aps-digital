const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLogLevel = import.meta.env.VITE_LOG_LEVEL || 'info';

export const logger = {
  error: (message, error) => {
    if (LOG_LEVELS.error <= LOG_LEVELS[currentLogLevel]) {
      console.error(`[ERROR] ${message}`, error);
    }
  },
  
  warn: (message) => {
    if (LOG_LEVELS.warn <= LOG_LEVELS[currentLogLevel]) {
      console.warn(`[WARN] ${message}`);
    }
  },
  
  info: (message) => {
    if (LOG_LEVELS.info <= LOG_LEVELS[currentLogLevel]) {
      console.info(`[INFO] ${message}`);
    }
  },
  
  debug: (message) => {
    if (LOG_LEVELS.debug <= LOG_LEVELS[currentLogLevel]) {
      console.debug(`[DEBUG] ${message}`);
    }
  },
};
