import { NotImplementedError } from '../exceptions/index.js';
import { ParsedLibConfig } from '../models/index.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function detectLibConfig(_forTask: 'build' | 'test'): Promise<ParsedLibConfig | null> {
    throw new NotImplementedError();
}
