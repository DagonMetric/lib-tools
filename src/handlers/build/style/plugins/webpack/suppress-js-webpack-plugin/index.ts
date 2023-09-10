export class SuppressJsWebpackPlugin {
    readonly name = 'SuppressJsWebpackPlugin';

    apply(compiler: import('webpack').Compiler): void {
        compiler.hooks.compilation.tap(this.name, (compilation) => {
            compilation.hooks.chunkAsset.tap(this.name, (chunk, filename) => {
                if (!filename.endsWith('.js')) {
                    return;
                }

                let hasCssFile = false;
                for (const file of chunk.files) {
                    if (file.endsWith('.css')) {
                        hasCssFile = true;
                        break;
                    }
                }

                if (!hasCssFile) {
                    return;
                }

                let cssOnly = false;
                const entryModules = compilation.chunkGraph.getChunkEntryModulesIterable(chunk);
                for (const module of entryModules) {
                    cssOnly = module.dependencies.every(
                        (dependency: {}) => dependency.constructor.name === 'CssDependency'
                    );

                    if (!cssOnly) {
                        break;
                    }
                }

                if (cssOnly) {
                    chunk.files.delete(filename);
                    compilation.deleteAsset(filename);
                }
            });
        });
    }
}
