import { z } from 'zod';

type Brand<Name extends string> = string & { readonly __brand: Name };

export type WorkflowId = Brand<'WorkflowId'>;
export type TaskId = Brand<'TaskId'>;
export type AgentDefinitionId = Brand<'AgentDefinitionId'>;
export type AgentSessionId = Brand<'AgentSessionId'>;
export type EventId = Brand<'EventId'>;
export type ApprovalId = Brand<'ApprovalId'>;
export type CorrelationId = Brand<'CorrelationId'>;

const createId = <Name extends string>(name: Name, value: string): Brand<Name> => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${name} cannot be empty`);
  }
  return normalized as Brand<Name>;
};

const createIdSchema = <Name extends string>(name: Name) =>
  z.string().refine((value) => value.trim().length > 0, {
    message: `${name} cannot be empty`
  }).transform((value) => value.trim() as Brand<Name>);

export const workflowId = (value: string): WorkflowId => createId('WorkflowId', value);
export const taskId = (value: string): TaskId => createId('TaskId', value);
export const agentDefinitionId = (value: string): AgentDefinitionId =>
  createId('AgentDefinitionId', value);
export const agentSessionId = (value: string): AgentSessionId =>
  createId('AgentSessionId', value);
export const eventId = (value: string): EventId => createId('EventId', value);
export const approvalId = (value: string): ApprovalId => createId('ApprovalId', value);
export const correlationId = (value: string): CorrelationId =>
  createId('CorrelationId', value);

export const WorkflowIdSchema = createIdSchema('WorkflowId');
export const TaskIdSchema = createIdSchema('TaskId');
export const AgentDefinitionIdSchema = createIdSchema('AgentDefinitionId');
export const AgentSessionIdSchema = createIdSchema('AgentSessionId');
export const EventIdSchema = createIdSchema('EventId');
export const ApprovalIdSchema = createIdSchema('ApprovalId');
export const CorrelationIdSchema = createIdSchema('CorrelationId');
