/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable no-restricted-globals */

module.exports = {
    preset: [
        // require('cssnano-preset-default'), { discardComments: false }
        'default',
        {
            discardComments: {
                remove(comment) {
                    return !/@preserve|@license|[@#]\s*sourceURL|[#@]\s*sourceMappingURL|^!/.test(comment);
                }
            }
        }
    ]
};
