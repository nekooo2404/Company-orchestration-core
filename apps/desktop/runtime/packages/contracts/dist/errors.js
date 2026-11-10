export class ContractValidationError extends Error {
    issues;
    code = 'CONTRACT_VALIDATION_ERROR';
    constructor(message, issues = []) {
        super(message);
        this.issues = issues;
        this.name = 'ContractValidationError';
    }
}
export class ContractInvariantError extends Error {
    code = 'CONTRACT_INVARIANT_ERROR';
    constructor(message) {
        super(message);
        this.name = 'ContractInvariantError';
    }
}
//# sourceMappingURL=errors.js.map