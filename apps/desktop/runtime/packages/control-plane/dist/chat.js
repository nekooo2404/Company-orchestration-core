import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const clone = (value) => structuredClone(value);
export class FileAgentChatStore {
    path;
    constructor(path) {
        this.path = path;
    }
    async list(workflowId) { try {
        const values = JSON.parse(await readFile(this.path, 'utf8'));
        return values.filter((value) => value.workflowId === workflowId).map(clone);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return [];
        throw error;
    } }
    async append(message) { let values = []; try {
        values = JSON.parse(await readFile(this.path, 'utf8'));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    } values.push(clone(message)); await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(values), 'utf8'); await rename(temporary, this.path); }
}
export class InMemoryAgentChatStore {
    messages = [];
    async list(workflowId) { return this.messages.filter((message) => message.workflowId === workflowId).map(clone); }
    async append(message) { this.messages.push(clone(message)); }
}
//# sourceMappingURL=chat.js.map