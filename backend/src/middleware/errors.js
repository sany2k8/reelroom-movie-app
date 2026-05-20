import { logger } from "../logger.js";
import { config } from "../config.js";

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code ?? null;
  }
}

export const notFound = (req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
};

/** Wraps async handlers so a rejected promise reaches the error handler. */
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars -- Express identifies this by arity.
export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;

  if (status >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.path }, "request.failed");
  } else {
    logger.warn({ err: err.message, path: req.path }, "request.rejected");
  }

  if (res.headersSent) return;

  res.status(status).json({
    error: status >= 500 && config.isProd ? "Internal server error" : err.message,
    code: err.code ?? undefined,
  });
}
