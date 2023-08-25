export interface OverridableTaskConfig<TTaskBase> {
    envOverrides?: Record<string, Partial<TTaskBase>>;
}
