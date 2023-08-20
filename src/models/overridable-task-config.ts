export interface OverridableTaskConfig<TTaskConfigBase> {
    envOverrides?: Record<string, Partial<TTaskConfigBase>>;
}
