const compareTasks = (left, right) => (right.priority ?? 0) - (left.priority ?? 0) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id);
const validateCapacity = (capacity) => {
    if (!Number.isInteger(capacity) || capacity < 0) {
        throw new RangeError('capacity must be a non-negative integer');
    }
};
const validateWeight = (weight, department) => {
    if (!Number.isInteger(weight) || weight < 1) {
        throw new RangeError(`weight for ${department} must be a positive integer`);
    }
};
export class FairQueue {
    options;
    nextSlot = 0;
    constructor(options = {}) {
        this.options = options;
    }
    take(entries, capacity) {
        validateCapacity(capacity);
        if (capacity === 0 || entries.length === 0) {
            return [];
        }
        const grouped = new Map();
        for (const entry of entries) {
            if (entry.department.trim().length === 0) {
                throw new Error('department cannot be empty');
            }
            const departmentEntries = grouped.get(entry.department) ?? [];
            departmentEntries.push(entry);
            grouped.set(entry.department, departmentEntries);
        }
        const departments = [...grouped.keys()].sort((left, right) => left.localeCompare(right));
        const slots = [];
        for (const department of departments) {
            const firstEntry = grouped.get(department)[0];
            const weight = this.options.weights?.[department] ?? firstEntry.weight ?? 1;
            validateWeight(weight, department);
            grouped.get(department).sort((left, right) => compareTasks(left.task, right.task));
            for (let index = 0; index < weight; index += 1) {
                slots.push(department);
            }
        }
        const selected = [];
        const remaining = new Map(departments.map((department) => [department, [...grouped.get(department)]]));
        let slot = this.nextSlot % slots.length;
        let emptyRounds = 0;
        while (selected.length < capacity && selected.length < entries.length) {
            const department = slots[slot];
            const departmentEntries = remaining.get(department);
            const next = departmentEntries.shift();
            if (next !== undefined) {
                selected.push(next);
                emptyRounds = 0;
            }
            else {
                emptyRounds += 1;
                if (emptyRounds >= slots.length) {
                    break;
                }
            }
            slot = (slot + 1) % slots.length;
        }
        this.nextSlot = slot;
        return selected;
    }
}
export function orderFairly(entries, capacity, options = {}) {
    return new FairQueue(options).take(entries, capacity);
}
//# sourceMappingURL=fair-queue.js.map