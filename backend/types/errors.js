/**
 * @file types/errors.ts
 * @description Shared error and validation type definitions
 */
export class AppError extends Error {
    constructor(code, message, details, statusCode = 500) {
        super(message);
        this.code = code;
        this.message = message;
        this.details = details;
        this.statusCode = statusCode;
        this.name = "AppError";
    }
}
//# sourceMappingURL=errors.js.map