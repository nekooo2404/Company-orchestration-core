const plans = [
    {
        strategyName: 'retry-with-changed-timeout',
        changedAssumption: 'The operation may need a longer execution window.',
        action: 'RETRY'
    },
    {
        strategyName: 'alternate-agent-or-model',
        changedAssumption: 'A different agent or model may handle this failure mode.',
        action: 'ALTERNATE_AGENT'
    },
    {
        strategyName: 'repair-dependency',
        changedAssumption: 'A missing or incompatible dependency is the likely cause.',
        action: 'DEPENDENCY_REPAIR'
    },
    {
        strategyName: 'rollback-workspace',
        changedAssumption: 'Recent workspace changes may have introduced the failure.',
        action: 'ROLLBACK'
    },
    {
        strategyName: 'revise-task-plan',
        changedAssumption: 'The current plan may encode an invalid assumption.',
        action: 'REPLAN'
    }
];
export const createDefaultRecoveryStrategies = () => plans.map((plan) => ({
    name: plan.strategyName,
    canHandle: () => true,
    plan: () => ({ ...plan })
}));
//# sourceMappingURL=recovery-strategies.js.map