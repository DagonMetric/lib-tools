export interface OverridableConfig<TConfigBase> {
    envOverrides?: Record<string, Partial<TConfigBase>>;
}
