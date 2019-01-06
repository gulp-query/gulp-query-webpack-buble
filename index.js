let Plugin = require('gulp-query').Plugin
  , node_path = require('path')
  , webpack = require("webpack")
  , TerserPlugin = require('terser-webpack-plugin')
;

class WebpackPlugin extends Plugin {

  static method() {
    return 'webpack';
  }

  webpackConfig() {
    return {
      //debug: true,
      entry: null,
      output: {
        path: null,
        filename: null
      },
      module: {
        rules: [
          {parser: {requireEnsure: false}},
        ]
      }
    };
  }

  webpackOptimize()
  {
    return {
      minimize: true,
      minimizer: [
        // This is only used in production mode
        new TerserPlugin({
          terserOptions: {
            parse: {
              // we want terser to parse ecma 8 code. However, we don't want it
              // to apply any minfication steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending futher investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
          // Use multi-process parallel running to improve the build speed
          // Default number of concurrent runs: os.cpus().length - 1
          parallel: true,
          // Enable file caching
          cache: true,
          sourceMap: false,
          // chunkFilter: (chunk) => {
          //   // Exclude uglification for the `vendor` chunk
          //   if (chunk.name === 'vendor') {
          //     return false;
          //   }
          //
          //   return true;
          // },
        }),
      ],
      // Automatically split vendor and commons
      // https://twitter.com/wSokra/status/969633336732905474
      // https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366
      splitChunks: {
        //chunks: 'all',
        chunks: 'async',
        name: false,
      },
      // Keep the runtime chunk seperated to enable long term caching
      // https://twitter.com/wSokra/status/969679223278505985
      //runtimeChunk: true
    };
  }

  run(task_name, config, callback) {
    let full = 'full' in config ? config['full'] : false;
    //let babel = 'babel' in config ? config['babel'] : true;
    let sourceMap = 'source_map' in config ? config['source_map'] : true;
    let sourceMapType = 'source_map_type' in config ? config['source_map_type'] : 'inline';
    sourceMapType = sourceMapType === 'inline' ? 'inline-source-map' : 'source-map';

    if (this.isProduction()) {
      sourceMap = false;
    }

    let path_to = this.path(config.to);
    let path_from = this.path(config.from);

    let storage_name = config.name ? config.name : path_from;

    let filename_from = node_path.basename(path_from);
    path_from = node_path.dirname(path_from) + '/';

    let filename_to = filename_from;
    if (node_path.extname(path_to) !== '') {
      filename_to = node_path.basename(path_to);
      path_to = node_path.dirname(path_to) + '/';
    }

    if (!(storage_name in WebpackPlugin.storage)) {
      let myDevConfigMin = this.webpackConfig();
      myDevConfigMin.entry = path_from + filename_from;
      myDevConfigMin.output.path = path_to;
      myDevConfigMin.output.filename = filename_to;

      if (sourceMap) {
        myDevConfigMin.devtool = sourceMapType;
      } else {
        myDevConfigMin.devtool = false;
      }

      myDevConfigMin.mode = this.isProduction() && !full ? 'production' : 'development';

      if (!this.isProduction()) {
        myDevConfigMin.output.pathinfo = true;
        //myDevConfigMin.output.publicPath = '/';
      }

      myDevConfigMin.module.rules.push({
        test: /\.jsx?$/,
        exclude: [/node_modules/, new RegExp(path_to)],
        use: {
          loader: require.resolve('buble-loader')
        }
      });

      myDevConfigMin.module.rules.push({
        test: /\.s?css$/,
        exclude: [/node_modules/, new RegExp(path_to)],
        use: [
          require.resolve('style-loader'),
          {
            loader: require.resolve('css-loader'),
            options: {
              sourceMap: sourceMap,
              importLoaders: 1
            }
          },
          {
            loader: require.resolve('postcss-loader'),
            options: {
              ident: 'postcss',
              plugins: () => [
                require('postcss-flexbugs-fixes'),
                require('postcss-preset-env')({
                  autoprefixer: {
                    flexbox: 'no-2009',
                    //grid: true.
                    browsers: [
                      '> 1%',
                      'last 3 versions'
                    ]
                  },
                  stage: 3,
                })
              ],
              sourceMap: sourceMap
            }
          },
          {
            loader: require.resolve('sass-loader'),
            options: {
              sourceMap: sourceMap,
              //includePaths: [path_from]
            }
          }
        ]
      });

      if (!full && this.isProduction()) {
        myDevConfigMin.optimization = this.webpackOptimize();
        myDevConfigMin.plugins = [

        ];
      }

      WebpackPlugin.storage[storage_name] = webpack(myDevConfigMin);
    }

    let _src = path_from + filename_from;
    let _dest = path_to + filename_to;

    let list = [];
    if (sourceMap) {
      if (sourceMapType === 'source-map') {
        list.push('Source map: file');
      } else {
        list.push('Source map: inline');
      }
    }

    if (!full && this.isProduction()) {
      list.push('Compress');
    }

    WebpackPlugin.storage[storage_name].run((err, stats) => {
      if (err) {
        this.reportError(task_name, _src, _dest, false);
        console.log(err);
      } else {
        this.report(task_name, _src, _dest, true, list);
        // console.log(stats.toString({
        //   chunks: false,  // Makes the build much quieter
        //   colors: true    // Shows colors in the console
        // }));
      }

      if (callback) {
        callback.call();
      }
    });
  }
}

WebpackPlugin.storage = {};

module.exports = WebpackPlugin;