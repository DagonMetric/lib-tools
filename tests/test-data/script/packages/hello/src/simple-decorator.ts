/* eslint-disable @typescript-eslint/no-explicit-any */
export function simpleDecorator(key: string): any {
    // eslint-disable-next-line no-console
    console.log('evaluate: ', key);
    return function () {
        // eslint-disable-next-line no-console
        console.log('call: ', key);
    };
}
