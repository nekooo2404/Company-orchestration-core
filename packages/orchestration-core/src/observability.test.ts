import { describe, expect, it } from 'vitest';
import { correlationId, taskId, workflowId } from '@aicompany/contracts';
import {
  InMemoryMetricsSink,
  InMemoryTraceSink,
  NoopMetricsSink,
  NoopTraceSink,
  recordMetric
} from './observability';

describe('observability ports', () => {
  it('retains workflow, task, session and correlation context for a completed span', () => {
    const sink = new InMemoryTraceSink();
    const span = sink.startSpan({
      name: 'tool.invoke', workflowId: workflowId('workflow-1'), taskId: taskId('task-1'),
      sessionId: 'session-1' as never, correlationId: correlationId('trace-1'),
      attributes: { operation: 'read' }
    });
    span.end({ result: 'ok' });
    expect(sink.spans).toEqual([expect.objectContaining({
      name: 'tool.invoke', workflowId: 'workflow-1', taskId: 'task-1',
      sessionId: 'session-1', correlationId: 'trace-1', status: 'ended',
      attributes: { operation: 'read', result: 'ok' }
    })]);
  });

  it('records failures once and ignores attempts to end an already closed span', () => {
    const sink = new InMemoryTraceSink();
    const span = sink.startSpan({ name: 'dispatch', workflowId: workflowId('w'),
      correlationId: correlationId('c'), attributes: {} });
    span.fail(new Error('provider unavailable'));
    span.end();
    expect(sink.spans).toHaveLength(1);
    expect(sink.spans[0]).toMatchObject({ status: 'failed', error: { name: 'Error', message: 'provider unavailable' } });
  });

  it('provides no-op ports and prevents metrics errors from escaping', () => {
    const span = NoopTraceSink.startSpan({ name: 'noop', workflowId: workflowId('w'),
      correlationId: correlationId('c'), attributes: {} });
    expect(() => span.end()).not.toThrow();
    expect(() => span.fail(new Error('ignored'))).not.toThrow();
    expect(() => NoopMetricsSink.increment('requests', 1, {})).not.toThrow();
    expect(() => recordMetric({ increment: () => { throw new Error('offline'); }, observe: () => {} }, 'increment', 'requests', 1, {})).not.toThrow();
  });

  it('copies metric tags and stores counters and observations deterministically', () => {
    const sink = new InMemoryMetricsSink();
    const tags = { operation: 'dispatch' };
    sink.increment('dispatches', 2, tags);
    sink.observe('latency_ms', 12.5, tags);
    tags.operation = 'mutated';
    expect(sink.metrics).toEqual([
      { kind: 'increment', name: 'dispatches', value: 2, tags: { operation: 'dispatch' } },
      { kind: 'observe', name: 'latency_ms', value: 12.5, tags: { operation: 'dispatch' } }
    ]);
  });
});
