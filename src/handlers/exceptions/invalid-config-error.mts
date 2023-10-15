/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { colors } from '../../utils/index.mjs';

function formatMessage(
    message: string,
    configPath: string | null | undefined,
    configLocation: string | null | undefined
): string {
    let formattedMsg = '';

    if (configPath) {
        formattedMsg += `${colors.lightCyan(configPath)} - `;
    }

    if (configLocation) {
        formattedMsg += colors.lightRed('Configuration error:') + ` ${message}`;

        formattedMsg += `\n  config location: `;
        formattedMsg += colors.lightRed(configLocation);
    } else {
        formattedMsg += colors.lightRed('Options error:') + ` ${message}`;
    }

    return formattedMsg;
}

export class InvalidConfigError extends Error {
    constructor(message: string, configPath: string | null | undefined, configLocation: string | null | undefined) {
        super(formatMessage(message, configPath, configLocation));
    }
}