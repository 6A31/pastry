export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const levelOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

function currentLevel(): LogLevel {
  const raw = (process.env.PASTRY_LOG_LEVEL || '').toLowerCase();
  if (['silent','error','warn','info','debug'].includes(raw)) return raw as LogLevel;
  return 'info';
}

function shouldLog(desired: LogLevel) {
  return levelOrder[desired] <= levelOrder[currentLevel()];
}

function ts() {
  return new Date().toISOString();
}

export const log = {
  debug: (...args: any[]) => { if (shouldLog('debug')) console.debug('[pastry]', ts(), '[DEBUG]', ...args); },
  info:  (...args: any[]) => { if (shouldLog('info'))  console.info('[pastry]', ts(), '[INFO]',  ...args); },
  warn:  (...args: any[]) => { if (shouldLog('warn'))  console.warn('[pastry]', ts(), '[WARN]',  ...args); },
  error: (...args: any[]) => { if (shouldLog('error')) console.error('[pastry]', ts(), '[ERROR]', ...args); }
};

export default log;