var _ = require('lodash');
var dispatch = require('../');

function fail(thing) { throw new Error(thing); }

function existy(x) { return x != null; }

function truthy(x) { return (x !== false) && existy(x); }

function doWhen(cond, action) {
  if(truthy(cond))
    return action();
  else
    return undefined;
}

function invoker (NAME, METHOD) {
  return function(target /* args ... */) {
    if (!existy(target)) fail('Must provide a target');

    var targetMethod = target[NAME];
    var args = _.rest(arguments);

    return doWhen(
      (existy(targetMethod) && METHOD === targetMethod),
      function() {
        return targetMethod.apply(target, args);
      }
    );
  };
}

function stringReverse(s) {
  if (!_.isString(s)) return undefined;
  return s.split('').reverse().join('');
}

console.log(stringReverse('abc'));
//=> "cba"

console.log(stringReverse(1));
//=> undefined

var rev = dispatch(
  invoker('reverse', Array.prototype.reverse),
  stringReverse
);

console.log(rev([1,2,3]));
//=> [3, 2, 1]

console.log(rev('abc'));
//=> "cba"
