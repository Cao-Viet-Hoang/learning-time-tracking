/* Error types and translation of low-level errors into readable messages. */

/** Thrown by services when user input is invalid. `fields` maps field → message. */
export class ValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class AuthError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "AuthError";
    this.field = field;
  }
}

/** Throws a ValidationError when `fields` has at least one message. */
export function assertValid(fields, summary = "Please fix the highlighted fields.") {
  const errors = Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
  if (Object.keys(errors).length) throw new ValidationError(summary, errors);
}

const FIRESTORE_MESSAGES = {
  "permission-denied": "Firestore rejected the request (permission denied). Check your Firestore security rules.",
  unavailable: "Firestore is unreachable right now. Check your connection — changes will sync when you are back online.",
  "deadline-exceeded": "Firestore took too long to respond. Please try again.",
  "resource-exhausted": "Firestore quota exceeded. Try again later.",
  "failed-precondition": "Firestore needs an index or configuration change for this query.",
  "not-found": "The item no longer exists. It may have been deleted elsewhere.",
  unauthenticated: "Your session is not authorised. Please sign in again.",
  "invalid-argument": "Firestore rejected invalid data.",
};

export function describeError(error) {
  if (!error) return "Something went wrong.";
  if (error instanceof ValidationError || error instanceof AuthError) return error.message;
  const code = String(error.code || "").replace(/^firestore\//, "");
  if (FIRESTORE_MESSAGES[code]) return FIRESTORE_MESSAGES[code];
  if (error.name === "TypeError" && /fetch|import|module/i.test(error.message)) {
    return "Could not load required resources. Check your internet connection.";
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Changes will sync when the connection returns.";
  }
  return error.message || "Something went wrong.";
}
