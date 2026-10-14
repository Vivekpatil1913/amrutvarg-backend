export class AppError extends Error {
  constructor(code, message, status = 400, details = []) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function notFound(resource = "Resource") {
  return new AppError("NOT_FOUND", `${resource} not found`, 404);
}

export function unauthorized(msg = "Authentication required") {
  return new AppError("UNAUTHENTICATED", msg, 401);
}

export function forbidden(msg = "Access denied") {
  return new AppError("FORBIDDEN", msg, 403);
}

export function conflict(msg, field) {
  return new AppError(
    "CONFLICT",
    msg,
    409,
    field ? [{ field, message: msg }] : []
  );
}

export function validation(details) {
  return new AppError(
    "VALIDATION_ERROR",
    "Validation failed",
    422,
    Array.isArray(details) ? details : [{ field: "body", message: details }]
  );
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function success(res, data, status = 200) {
  return res.status(status).json({ data });
}

export function paginated(res, rows, total, page, pageSize) {
  return res.json({
    data: rows,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
