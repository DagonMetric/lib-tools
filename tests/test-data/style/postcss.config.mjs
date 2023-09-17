/**
 * @param {{logLevel: string;env?: string;}} [ctx]
 */
export default function (ctx) {
    return {
        plugins: {
            'postcss-preset-env': {
                debug: ctx.logLevel === 'debug' ? true : false,
                env: ctx.env,
                stage: 1,
                minimumVendorImplementations: 0
                // browsers: ['last 1 versions and supports es6-module']
                // autoprefixer: {
                //     // env: ctx.env, //  (string): environment for Browserslist.,
                //     grid: true
                // }
            }
        }
    };
}
