/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */

import { WriteStream } from 'node:tty';

function supportColor(): boolean {
    if (process.env.FORCE_COLOR !== undefined) {
        // 2 colors: FORCE_COLOR = 0 (Disables colors), depth 1
        // 16 colors: FORCE_COLOR = 1, depth 4
        // 256 colors: FORCE_COLOR = 2, depth 8
        // 16,777,216 colors: FORCE_COLOR = 3, depth 16
        // See: https://nodejs.org/dist/latest-v12.x/docs/api/tty.html#tty_writestream_getcolordepth_env
        // and https://github.com/nodejs/node/blob/b9f36062d7b5c5039498e98d2f2c180dca2a7065/lib/internal/tty.js#L106;
        switch (process.env.FORCE_COLOR) {
            case '':
            case 'true':
            case '1':
            case '2':
            case '3':
                return true;
            default:
                return false;
        }
    }

    if (process.stdout instanceof WriteStream) {
        return process.stdout.getColorDepth() > 1;
    }

    return false;
}

type ColorKeys =
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'lightRed'
    | 'lightGreen'
    | 'lightYellow'
    | 'lightBlue'
    | 'lightMagenta'
    | 'lightCyan';

const ansiColorOpenTags: Record<ColorKeys, string> = {
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
    lightRed: '\u001b[91m',
    lightGreen: '\u001b[92m',
    lightYellow: '\u001b[93m',
    lightBlue: '\u001b[94m',
    lightMagenta: '\u001b[95m',
    lightCyan: '\u001b[96m'
};

const ansiColorCloseTag = '\u001b[39m';

function colorize(str: string, colorKey: ColorKeys): string {
    if (!supportColor()) {
        return str;
    }

    if (!colorKey || !(colorKey in ansiColorOpenTags)) {
        return str;
    }

    const buf: string[] = [];

    // Open tag
    buf.push(ansiColorOpenTags[colorKey]);
    // Input
    buf.push(str);
    // Close tag
    buf.push(ansiColorCloseTag);

    return buf.join('');
}

let _ansiRegExp: RegExp | undefined;

// Copy from https://github.com/chalk/ansi-regex/blob/main/index.js
function ansiRegExp(onlyFirst = false): RegExp {
    if (_ansiRegExp) {
        return _ansiRegExp;
    }
    const pattern = [
        '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
        '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))'
    ].join('|');

    _ansiRegExp = new RegExp(pattern, onlyFirst ? undefined : 'g');

    return _ansiRegExp;
}

export const colors = {
    red: (str: string) => colorize(str, 'red'),
    green: (str: string) => colorize(str, 'green'),
    yellow: (str: string) => colorize(str, 'yellow'),
    blue: (str: string) => colorize(str, 'blue'),
    magenta: (str: string) => colorize(str, 'magenta'),
    cyan: (str: string) => colorize(str, 'cyan'),
    lightRed: (str: string) => colorize(str, 'lightRed'),
    lightGreen: (str: string) => colorize(str, 'lightGreen'),
    lightYellow: (str: string) => colorize(str, 'lightYellow'),
    lightBlue: (str: string) => colorize(str, 'lightBlue'),
    lightMagenta: (str: string) => colorize(str, 'lightMagenta'),
    lightCyan: (str: string) => colorize(str, 'lightCyan'),
    stripColor: (str: string, onlyFirst = false) => str.replace(ansiRegExp(onlyFirst), ''),
    supportColor
};
