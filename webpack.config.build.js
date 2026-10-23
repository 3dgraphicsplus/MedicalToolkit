const mode = process.env.NODE_ENV !== 'production' ? 'development' : 'production';

const path = require('path');
const webpack = require('webpack');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const CompressionPlugin = require('compression-webpack-plugin');

const config = {
  entry: ['./src/ami.ts'],
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: mode === 'development' ? 'ami.js' : 'ami.min.js',
    library: {
      name: 'AMI',
      type: 'umd',
      umdNamedDefine: true,
    },
    globalObject: 'this',
  },
  mode,
  resolve: {
    modules: [path.resolve(__dirname, 'src'), 'node_modules'],
    extensions: ['.ts', '.js', '.css', '.html'],
    alias: {
      base: path.resolve(__dirname, 'src'),
      pako: path.resolve(__dirname, 'node_modules', 'pako'),
    },
    fallback: { fs: false, path: false, crypto: false, zlib: false, stream: false, buffer: false },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        include: [path.resolve(__dirname, 'src')],
        exclude: [/node_modules/, /external/],
      },
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        include: [path.resolve(__dirname, 'src')],
        exclude: [/external/],
        options: { transpileOnly: true },
      },
    ],
  },
  resolveLoader: {
    modules: [path.resolve(__dirname, 'node_modules')],
  },
  performance: { hints: false },
  plugins: [],
  optimization: {
    // minimizer: [
    //   new UglifyJsPlugin({
    //     parallel: true,
    //   }),
    // ],
   // concatenateModules: false,
  },
};

if (process.env.NODE_WEBPACK_TARGET) {
  config.entry = [
    path.resolve(__dirname, process.env.NODE_WEBPACK_TARGET, process.env.NODE_WEBPACK_NAME + '.js'),
  ];

  config.resolve.modules.push(path.resolve(__dirname, process.env.NODE_WEBPACK_TARGET));
  config.output.path = path.resolve(__dirname, process.env.NODE_WEBPACK_TARGET);
  config.output.filename = process.env.NODE_WEBPACK_NAME + '.js';
  config.output.library = undefined;
  config.output.globalObject = undefined;

  config.module.rules
    .find(r => r.loader === 'babel-loader')
    .include.push(path.resolve(__dirname, process.env.NODE_WEBPACK_TARGET));

  const workPath = path.resolve(__dirname, process.env.NODE_WEBPACK_TARGET);

  // examples use the bundled three.js (same instance as ami) through the THREE global name
  config.plugins.push(new webpack.ProvidePlugin({ THREE: 'three' }));

  const dataPath = path.resolve(__dirname, 'data');

  config.devServer = {
    static: [workPath, dataPath, path.resolve(__dirname, 'build')].map(directory => ({
      directory,
      watch: true,
    })),
    historyApiFallback: true,
  };
} else if (mode === 'production') {
  config.plugins.push(
    new CompressionPlugin({
      algorithm: 'gzip',
    })
  );
}

if (process.env.NODE_WEBPACK_ANALYZE) {
  config.plugins.push(new BundleAnalyzerPlugin());
}

module.exports = config;
