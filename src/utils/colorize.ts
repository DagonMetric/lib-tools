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

const openTags: Record<string, string> = {
    black: '\u001b[30m',
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
    white: '\u001b[37m'
};

const closeTag = '\u001b[39m';

function colorize(str: string, colorKey: string): string {
    if (!supportColor()) {
        return str;
    }

    if (!colorKey || !(colorKey in openTags)) {
        return str;
    }

    const buf: string[] = [];

    // Open tag
    buf.push(openTags[colorKey]);
    // Input
    buf.push(str);
    // Close tag
    buf.push(closeTag);

    return buf.join('');
}

export const colors = {
    black: (str: string) => colorize(str, 'black'),
    red: (str: string) => colorize(str, 'red'),
    green: (str: string) => colorize(str, 'green'),
    yellow: (str: string) => colorize(str, 'yellow'),
    blue: (str: string) => colorize(str, 'blue'),
    magenta: (str: string) => colorize(str, 'magenta'),
    cyan: (str: string) => colorize(str, 'cyan'),
    white: (str: string) => colorize(str, 'whte')
};
