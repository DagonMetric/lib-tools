export interface OverridableTask<TTaskBase> {
    envOverrides?: Record<string, Partial<TTaskBase>>;
}
