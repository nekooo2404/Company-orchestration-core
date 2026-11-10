export class OptimisticConcurrencyError extends Error {
    expectedVersion;
    actualVersion;
    constructor(aggregateId, expectedVersion, actualVersion) {
        super(`Optimistic concurrency conflict for ${aggregateId}: expected version ${expectedVersion}, actual version ${actualVersion}`);
        this.name = 'OptimisticConcurrencyError';
        this.expectedVersion = expectedVersion;
        this.actualVersion = actualVersion;
    }
}
export class DuplicatePersistenceIdError extends Error {
    constructor(kind, id) {
        super(`Duplicate ${kind} with ID ${id} has different data`);
        this.name = 'DuplicatePersistenceIdError';
    }
}
export class InvalidPersistenceOperationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidPersistenceOperationError';
    }
}
//# sourceMappingURL=repository.js.map