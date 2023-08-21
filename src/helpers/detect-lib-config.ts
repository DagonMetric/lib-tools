import { NotImplementedError } from '../exceptions/index.js';
import { ParsedLibConfig } from '../models/index.js';

export function detectLibConfig(): Promise<ParsedLibConfig | null> {
    throw new NotImplementedError();
}
