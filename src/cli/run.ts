import { CliInfo } from './cli-info.js';

export default async function (cliInfo: CliInfo): Promise<void> {
    console.log(cliInfo);
    await Promise.resolve(0);
}
