'use strict';

/**!
 * [square]
 * @copyright (c) 2012 observe.it (observe.it) <opensource@observe.it>
 * MIT Licensed
 */
var Plugin = require('../plugin')
  , async = require('async')
  , cluster = require('./lib/crusher');

/**
 * Crush and compile different files a.k.a minify all the things.
 *
 * Options:
 * - engines: Which engines should we use to compile the content. This could
 *   either be comma separated string that contains the different engines you
 *   want to run it against. Or an Object which contains they different engines
 *   for each file extension.
 * - analyse: Analyse which crusher and / or combination provides the best
 *   minification for your code. Should be a string containing the engines
 *   you want to test or a boolean for all engines.
 * - metrics: Should we output some metrics.
 *
 * @constructor
 * @api public
 */
module.exports = Plugin.extend({
    /**
     * Name of the module.
     *
     * @type {String}
     */
    id: 'minify'

    /**
     * Small description about the module.
     *
     * @type {String}
     */
  , description: [
        'Minifies all the things'
    ].join(' ')

    /**
     * For which distributions should this run.
     *
     * @type {String}
     */
  , distributions: 'min'

    /**
     * Which file extension are accepted.
     *
     * @type {Array}
     */
  , accepts: ['js', 'css']

    /**
     * Which engines should be used for minifying the content? It can be a comma
     * separated list of engines. Each engine will process the result of the
     * previous engine and potentially creating a higher saving at the cost of
     * longer processing.
     *
     * @type {String}
     */
  , engines: ''

    /**
     * Should we analyse which crusher or combination of curshers yields the
     * best results? If's often possible that engine x works great on code base
     * y but doesn't work as good as expected on a different code base as each
     * engine has it's own bag of tricks to optimize the content.
     *
     * @type {Boolean|String}
     */
  , analyse: false

    /**
     * Full will do a permutation of all engines of analyse, otherwise only
     * unique unordered combinations are run.
     *
     * @type {Boolean}
     */
  , full: false

    /**
     * Should we generate and output some metrics about the compilation?
     *
     * @type {Boolean}
     */
  , metrics: true

    /**
     * The module has been initialized.
     */
  , initialize: function initialize() {
      var self = this
        , tasks = {};

      // Check if we need to register the cluster as longrunning handle with the
      // square instance.
      // @NOTE: we might need to add this callback to every square instance not
      // just the one that started it..
      if (!cluster.initialized) {
        this.square.longrunning('cluster', cluster.kill);
      }

      // No engine property is set, so set a decent default, but make it aware
      // of the extension.
      if (!this.engines) {
        if (this.extension === 'js') this.engines = 'closure';
        else if (this.extension === 'css') this.engines = 'csso';
        else return this.emit('error', new Error('No engine is set'));
      }

      // Check if the engines key is an object or string, if it's an object it
      // has specific engines for each extension.. atleast that is something
      // that we are gonna assume here
      if (typeof this.engines === 'object') {
        if (Array.isArray(this.engines)) this.engines = this.engines.join(',');
        else this.engines = this.engines[this.extension] || '';
      }

      // The user has requested us to analyse the content and figure out the
      // best the compiler strategy
      if (this.analyse) tasks.analyser = async.apply(this.analyser.bind(this));
      tasks.runner = async.apply(cluster.send, {
          engines:    this.engines
        , extension:  this.extension
        , content:    this.content
        , gzip:       this.metrics
      });

      async.parallel(tasks, function (err, results) {
        // Notify the processer of any crushers errors that occured.
        if(err) return self.emit('error', err);

        var result, factor;
        if (results.analyser) {
          result = results.analyser;
          self.logger.info('The fastest ' + self.extension + ' engine:     '+ result.fastest.engines);
          self.logger.info('The smallest ' + self.extension + ' content:   '+ result.filesize.engines);
          self.logger.info('The best compressed ' + self.extension + ':    '+ result.bandwidth.engines);
        }

        if (self.metrics) {
          result = results.runner;
          factor = Buffer.byteLength(result.content) / result.gzip;
          self.logger.metric([
              'compressed: '.white + self.bytes(Buffer.byteLength(result.content)).green
            , ' minified, '.white + self.bytes(result.gzip).green
            , ' gzip. Which is a factor of '.white
            , factor.toFixed(1).toString().green
          ].join(''));
        }

        // Square performance is so good that sometimes this event is emitted
        // before any listener is ready to receive data, wait for next loop!
        process.nextTick(function () {
          self.emit('data', results.runner.content);
        });
      });
    }

    /**
     * Really simply byteLength formatter.
     *
     * @param {Number} value integer
     * @returns {String} formatted string
     * @api private
     */
  , bytes: function bytes(value) {
      return (value / 1000).toFixed(0) + 'kb';
    }

    /**
     * Analyse which plugin or plugin set provides the best compression for the
     * given content.
     *
     * @param {Function} cb
     * @api private
     */
  , analyser: function analyser(cb) {
      var compilers = typeof this.analyse === 'string'
            ? this.analyse.split(/\s?\,\s?/).filter(Boolean)
            : Object.keys(cluster[this.extension])
        , combinations = this.permutations(compilers, this.full)
        , results = []
        , self = this
        , error
        , queue;

      this.logger.notice(
          'analysing '+ combinations.length +' combinations of ' + this.extension
        + ' engines, grab a coffee!'
      );
      this.logger.notice(
        'Add comma seperated engines to the configuration to reduce runtime'
      );

      // To ensure that the system stays responsive during large permutations we
      // need to do this as a serial operation. Running more than 500 tasks
      // concurrently will fuck up your system and that is not something we want
      // to introduce.
      queue = this.async.queue(function forEach(list, callback) {
        cluster.send({
            extension: self.extension
          , engines: list.join(',')
          , content: self.content
          , gzip: true
        }, function compiling(err, data) {
          if (err)  self.logger.debug('Failed to analyse '+ list, err);
          if (err && !error) error = err;

          results.push(data);
          callback();
        });
      }, 20);

      queue.push(combinations);
      queue.drain = function ready() {
        if (error) console.log(error.message, error.stack);
        if (error) return cb(error);

        // Map the results in to useful things
        results = results.map(function map(res) {
          return {
              minified: Buffer.byteLength(res.content)
            , duration: res.duration || Infinity
            , engines: res.engines
            , content: res.content
            , gzip: +res.gzip || 0
          };
        });

        // Calculate some stats from the analytic procedure
        // - The fastest crusher
        // - The least file size
        // - The best bandwidth saving (using gzip)
        var stats = {};
        stats.fastest = results.sort(function sort(a, b) {
          return a.duration - b.duration;
        })[0];

        stats.filesize = results.sort(function sort(a, b) {
          return a.minified - b.minified;
        })[0];

        stats.bandwidth = results.sort(function sort(a, b) {
          return a.gzip - b.gzip;
        })[0];

        stats.results = results;
        cb(undefined, stats);
      };
    }

    /**
     * Generate permutations of the given array. So we have all possible
     * combination possible.
     *
     * @param {Array} collection
     * @param {Boolean} order do full stack or
     */
  , permutations: function permutation(collection, order) {
      var permutations = []
        , combinations = []
        , seen = [];

      /**
       * Full iterator for the permutations
       *
       * @param {Array} source
       * @returns {Array} permutations
       * @api private
       */
      function full(source) {
        for (var i = 0, item; i < source.length; i++) {
          item = source.splice(i, 1)[0];
          seen.push(item);

          if (source.length === 0) permutations.push(seen.slice());
          full(source);

          source.splice(i, 0, item);
          seen.pop();
        }

        return permutations;
      }

      /**
       * Fast iterator for the combinations
       *
       * @param {Array} source
       * @returns {Array} combinations
       * @api private
       */
      function fast(source) {
        var i = source.length;

        while (i--) {
          combinations.push(source.slice(0, i + 1));
          if (i === 1) fast(source.slice(i));
        }

        return combinations;
      }

      return !order ? fast(collection) : fast(collection).concat(full(collection));
    }
});

if (process.env.NODE_ENV === 'testing') {
  module.exports.cluster = cluster;
}
