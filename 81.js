(function(define) {
'use strict';
define(function(require) {

   /**
    * Provides density function, cumulative distribution function,
    * quantile function, and random number generator
    * for the lognormal distribution, with parameter $\mu$ (`meanlog`) and
    * $\sigma$ (`sdlog`) for the associated normal distribution.
    *
    * The lognormal is defined by the pdf:
    * $$f(x;\mu,\sigma) = \frac{1}{x\sigma \sqrt{2\pi}} e^{\displaystyle -\frac{(\ln x-\mu)^2}{2\sigma^2}}$$
    * where $x\in(0,\infty)$.
    *
    * `dlnorm` provides access to this probability density function,
    * `plnorm` to the cumulative distribution function, `qlnorm` to the
    * quantile function (inverse cdf)
    * and `rlnorm` to random deviates.
    *
    * Finally, you can use `lognormal` to obtain an object
    * representing the distribution for some values of the parameters.
    * @module distributions.lognormal
    * @memberof distributions
    * @author Haris Skiadas <skiadas@hanover.edu>, Barb Wahl <wahl@hanover.edu>
    */
   var normal, C, logRoot2pi, recipRoot2pi, utils;

   normal = require('./normal');
   C = require('../constants');
   logRoot2pi = C.log2pi * 0.5;
   recipRoot2pi = 1 / C.sqrt2pi;
   utils = require('../utils');

   /**
    * Evaluates the lognormal distribution's density function at `x`.
    *
    * Expects $x > 0$ and $\textrm{sdlog} > 0$.
    * @fullName dlnorm(meanlog, sdlog, logp)(x)
    * @memberof lognormal
    */
   function dlnorm(meanlog, sdlog, logp) {
      logp = logp === true;

      if (utils.hasNaN(meanlog, sdlog) || sdlog < 0) {
         return function() { return NaN; };
      }

      return function(x) {
         var z;

         if (utils.hasNaN(x)) { return NaN; }
         if (sdlog === 0) {
            return Math.log(x) === meanlog ? Infinity
                                    : logp ? -Infinity
                                           : 0;
         }
         if (x <= 0) { return logp ? -Infinity : 0; }

         z = (Math.log(x) - meanlog) / sdlog;
         return logp ? -(logRoot2pi + 0.5 * z * z + Math.log(x * sdlog))
                     : recipRoot2pi * Math.exp(-0.5 * z * z) / (x * sdlog);
      };
   }

   /**
    * Evaluates the lower-tail cdf at `x` for the lognormal distribution:
    * $$\textrm{pnorm}(\mu, \sigma)(x) = \frac{1}{2}\left(1 + \textrm{erf}\left(\frac{\ln x - \mu}{\sigma\sqrt{2}}\right)\right)$$
    *
    * `lowerTail` defaults to `true`; if `lowerTail` is `false`, returns
    * the upper tail probability instead.
    *
    * `logp` defaults to `false`; if `logp` is `true`, returns the logarithm
    * of the result.
    *
    * Expects $\textrm{sdlog} > 0$ and $x > 0$.
    *
    * @fullName plnorm(meanlog, sdlog, lowerTail, logp)(x)
    * @memberof lognormal
    */
   function plnorm(meanlog, sdlog, lowerTail, logp) {
      var pnorm;

      lowerTail = lowerTail !== false;
      logp = logp === true;

      if (utils.hasNaN(meanlog, sdlog) || sdlog < 0) {
         return function() { return NaN; };
      }

      pnorm = normal.pnorm(meanlog, sdlog, lowerTail, logp);

      return function(x) {
         if (utils.hasNaN(x)) { return NaN; }
         if (x <= 0) {
            return lowerTail ? logp ? -Infinity : 0
                             : logp ? 0 : 1;
         }

         return pnorm(Math.log(x));
      };
   }

   /**
    * Evaluates the lognormal distribution's quantile function (inverse cdf) at `p`:
    * $$\textrm{qlnorm}(\mu, \sigma)(p) = x \textrm{ such that } \textrm{prob}(X \leq x) = p$$
    * where $X$ is a random variable with the lognormal distribution.
    *
    * `lowerTail` defaults to `true`; if `lowerTail` is `false`, `p` is
    * interpreted as an upper tail probability (returns
    * $x$ such that $\textrm{prob}(X > x) = p)$.
    *
    * `logp` defaults to `false`; if `logp` is `true`, interprets `p` as
    * the logarithm of the desired probability.
    *
    * Expects $\textrm{sdlog} > 0$.
    * @fullName qlnorm(meanlog, sdlog, lowerTail, logp)(p)
    * @memberof lognormal
    */
   function qlnorm(meanlog, sdlog, lowerTail, logp) {
      var qnorm;

      logp = logp === true;
      lowerTail = lowerTail !== false;
      qnorm = normal.qnorm(meanlog, sdlog, lowerTail, logp);

      if (utils.hasNaN(meanlog, sdlog)) {
         return function() { return NaN; };
      }

      return utils.qhelper(lowerTail, logp, 0, Infinity,
         function(p) { return Math.exp(qnorm(p)); }
      );
   }

   /**
    * Returns a random variate from the lognormal distribution.
    *
    * Expects $\textrm{sdlog} > 0$.
    *
    * Uses a rejection polar method.
    * @fullName rlnorm(meanlog, sdlog)()
    * @memberof lognormal
    */
   function rlnorm(meanlog, sdlog) {
      var rnorm;

      rnorm = normal.rnorm(meanlog, sdlog);

      return function() {
         return Math.exp(rnorm());
      };
   }

   return {
      /**
       * Returns an object representing a normal distribution, with properties `d`, `p`, `q`, `r`.
       * ```
       * lognormal(meanlog, sdlog).d(x, logp)            // same as dlnorm(meanlog, sdlog, logp)(x)
       * lognormal(meanlog, sdlog).p(x, lowerTail, logp) // same as plnorm(meanlog, sdlog, lowerTail, logp)(x)
       * lognormal(meanlog, sdlog).q(x, lowerTail, logp) // same as qlnorm(meanlog, sdlog, lowerTail, logp)(x)
       * lognormal(meanlog, sdlog).r()                   // same as rlnorm(meanlog, sdlog)()
       * ```
       * @memberof lognormal
       */
      lognormal: function(meanlog, sdlog) {
         return {
            d: function(x, logp) { return dlnorm(meanlog, sdlog, logp)(x); },
            p: function(q, lowerTail, logp) {
               return plnorm(meanlog, sdlog, lowerTail, logp)(q);
            },
            q: function(p, lowerTail, logp) {
               return qlnorm(meanlog, sdlog, lowerTail, logp)(p);
            },
            r: function() { return rlnorm(meanlog, sdlog)(); }
         };
      },
      dlnorm: dlnorm,
      plnorm: plnorm,
      qlnorm: qlnorm,
      rlnorm: rlnorm
   };

});

}(typeof define === 'function' && define.amd ? define : function(factory) {
   'use strict';
   module.exports = factory(require);
}));
