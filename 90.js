/**
 * Lightweight JSON parsing try / catch errback function.
 *
 * Returns JSON object if successfully parsed and Error object if failed.
 *
 * @param {String} JSON string to parse into javascript object
 */

module.exports = function parseJSON(json, callback) {
  var parsedJSON = null;
  var error = null;

  try {
    parsedJSON = JSON.parse(json);
    return callback(null, parsedJSON);
  }
  catch (error) {
    return callback(error);
  }
};
