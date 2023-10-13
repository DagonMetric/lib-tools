import * as tsTypes from 'typescript';

/**
 * @internal
 */
export let ts: typeof tsTypes;

/**
 * @internal
 */
export function setTypescriptModule(override: typeof tsTypes) {
    ts = override;
}
