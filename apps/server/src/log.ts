export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

export const consoleLogger: Logger = (level, message, data) => {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (data) out(line, JSON.stringify(data));
  else out(line);
};

export const silentLogger: Logger = () => {};
