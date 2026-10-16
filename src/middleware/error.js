import { AppError } from "../lib/errors.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
}

export function errorHandler(err, req, res, _next) {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: { code: "FILE_TOO_LARGE", message: "Uploaded file exceeds the allowed size." },
    });
  }
  if (typeof err?.code === "string" && err.code.startsWith("LIMIT_")) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid file upload." },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // PostgreSQL unique violation
  if (err.code === "23505") {
    return res.status(409).json({
      error: { code: "CONFLICT", message: "A record with these values already exists." },
    });
  }

  // PostgreSQL check-constraint violation. The request schemas are meant to
  // catch these first; reaching here means a rule exists only in the database,
  // which is a client error rather than a server fault — a 500 would send the
  // caller looking in the wrong place.
  if (err.code === "23514") {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "That combination of values is not allowed.", details: [] },
    });
  }

  // Foreign-key violation: the request named a related record that does not
  // exist. Routes that can produce one should check it first and say WHICH
  // field is wrong; this is the net under them, so a bad id is reported as the
  // client error it is rather than as a server fault.
  if (err.code === "23503") {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "That record refers to something that does not exist.",
        details: [],
      },
    });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    },
  });
}
