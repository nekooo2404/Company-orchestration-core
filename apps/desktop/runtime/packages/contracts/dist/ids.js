import { z } from '../../../deps/zod/index.js';
const createId = (name, value) => {
    const normalized = value.trim();
    if (normalized.length === 0) {
        throw new Error(`${name} cannot be empty`);
    }
    return normalized;
};
const createIdSchema = (name) => z.string().refine((value) => value.trim().length > 0, {
    message: `${name} cannot be empty`
}).transform((value) => value.trim());
export const workflowId = (value) => createId('WorkflowId', value);
export const taskId = (value) => createId('TaskId', value);
export const agentDefinitionId = (value) => createId('AgentDefinitionId', value);
export const agentSessionId = (value) => createId('AgentSessionId', value);
export const eventId = (value) => createId('EventId', value);
export const approvalId = (value) => createId('ApprovalId', value);
export const correlationId = (value) => createId('CorrelationId', value);
export const WorkflowIdSchema = createIdSchema('WorkflowId');
export const TaskIdSchema = createIdSchema('TaskId');
export const AgentDefinitionIdSchema = createIdSchema('AgentDefinitionId');
export const AgentSessionIdSchema = createIdSchema('AgentSessionId');
export const EventIdSchema = createIdSchema('EventId');
export const ApprovalIdSchema = createIdSchema('ApprovalId');
export const CorrelationIdSchema = createIdSchema('CorrelationId');
//# sourceMappingURL=ids.js.map