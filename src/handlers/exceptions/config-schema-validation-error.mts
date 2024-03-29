/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */

import { ErrorObject } from 'ajv';

import { colors } from '../../utils/index.mjs';

const seeMoreWikiLink = 'https://github.com/DagonMetric/lib-tools/wiki/Lib-Tools-Workspace-Configuration';

function formatMessage(errors: ErrorObject[], configPath: string | null | undefined): string {
    let formattedMessage = '';
    if (configPath) {
        formattedMessage += colors.lightCyan(configPath) + ' - ';
    }

    formattedMessage += colors.lightRed('Configuration validation errors:');
    const anyOfFinishedGroups: string[] = [];

    for (const error of errors) {
        const anyOfGroupKey = `${error.instancePath}-anyOf-${error.keyword}`;
        if (anyOfFinishedGroups.includes(anyOfGroupKey)) {
            continue;
        }

        let msg = `config location: ${colors.lightRed(error.instancePath?.trim() ?? '/')} - `;

        if (error.keyword === 'type' || error.keyword === 'required') {
            const groupErrors = errors.filter(
                (e) => e.instancePath === error.instancePath && e.keyword === error.keyword
            );

            const anyOfErrors = errors.filter((e) => e.instancePath === error.instancePath && e.keyword === 'anyOf');

            if (groupErrors.length > 1 && anyOfErrors.length === 1) {
                if (error.keyword === 'type') {
                    const anyOfTypes = groupErrors.filter((e) => e.params?.type).map((e) => e.params.type as string);
                    msg += `must be ` + anyOfTypes.join(' or ');
                } else {
                    const anyOfProperties = groupErrors
                        .filter((e) => e.params?.missingProperty)
                        .map((e) => e.params.missingProperty as string);
                    msg += `must have any of properties ` + anyOfProperties.map((v) => `'${v}'`).join(' or ');
                }

                anyOfFinishedGroups.push(anyOfGroupKey);
                anyOfFinishedGroups.push(`${error.instancePath}-anyOf-anyOf`);

                formattedMessage += `\n  ${msg}.`;

                continue;
            }
        }

        msg += error.message;

        if (error.params && Object.keys(error.params).length) {
            if (error.keyword === 'additionalProperties' && error.params.additionalProperty) {
                msg += ` '${error.params.additionalProperty}'`;
            } else if (
                error.keyword === 'enum' &&
                error.params.allowedValues &&
                Array.isArray(error.params.allowedValues)
            ) {
                msg += `. Allowed values are: ${(error.params.allowedValues as string[] | undefined)
                    ?.map((v) => `'${v}'`)
                    .join(', ')}`;
            }
        }

        formattedMessage += `\n  ${msg}.`;
    }

    formattedMessage += `\nSee more about libconfig.json configuration at ${colors.lightCyan(seeMoreWikiLink)}.`;

    return formattedMessage;
}

export class ConfigSchemaValidationError extends Error {
    constructor(errors: ErrorObject[], configPath: string | null | undefined) {
        super(formatMessage(errors, configPath));
    }
}
