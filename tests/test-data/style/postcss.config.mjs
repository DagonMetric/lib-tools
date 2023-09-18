/**
 * @param {{logLevel: string;env?: string;}} [ctx]
 */
export default function () {
    return {
        plugins: {
            // 'postcss-preset-env': {
            //     debug: ctx.logLevel === 'debug' ? true : false,
            //     env: ctx.env,
            //     stage: false,
            //     minimumVendorImplementations: 3,
            //     browsers: []
            //     // autoprefixer: {
            //     //     // env: ctx.env, //  (string): environment for Browserslist.,
            //     //     grid: true
            //     // }
            // }
        }
    };
}
