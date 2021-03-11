module.exports = {
    webpack: (config) => {
        config.module.rules = [{
            test: /\.(tsx|ts)$/,
            use: [{
                loader: 'ts-loader',
                options: {
                    configFile: 'tsconfig.build.json',
                    compiler: 'ttypescript'
                }
            }],
        }, ...config.module.rules.map(r => {
            if(String(r.test).includes("ts")){
                return {...r, test: /\.(js|mjs|jsx)$/}
            }
            return r
        })]

        return config
    },
}