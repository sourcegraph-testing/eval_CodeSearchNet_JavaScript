import Cookies from 'js-cookie'

import {ApiError} from './errors'

/**
 * Make it a little easier to use content types.
 */
const contentTypes = {
  form: 'application/x-www-form-urlencoded',
  multiForm: 'multipart/form-data',
  json: 'application/json',
  jsonApi: 'application/vnd.api+json'
}

function matchContentType(src, id) {
  if (!src)
    return false
  let ii = src.indexOf(';')
  if (ii >= 0)
    src = src.substring(0, ii)
  return src.toLowerCase() == contentTypes[id]
}

function addTrailingSlash( path ) {
  return path + ((path[path.length - 1] == '/') ? '' : '/')
}

/**
 * Find and replace terms in a string.
 *
 * Terms are identified by being surrounded by curly braces, such as
 * this: "a string with a {substitution}". Here, "substitution" will
 * be replaced by looking for the same named key in the supplied
 * mapping.
 *
 * @param {string} text - The string with replacements.
 * @param {object} mapping - The mapping.
 */
export function supplant( text, mapping ) {
  return text.replace(
    /{([^{}]*)}/g,
    function( a, b ) {
      let r = mapping[b]
      if( r === undefined ) {
        throw new ApiError( `Missing string template: ${b}` )
      }
      return typeof r === 'string' || typeof r === 'number' ? r : a
    }
  )
}

/**
 * Capitalize a string.
 *
 * @param {string} text - The string to capitalize.
 */
export function capitalize( text ) {
  return text[0].toUpperCase() + text.slice( 1 )
}

function isEmpty(value) {
  return value === '' || value === undefined || value === null
}

/**
 * Global storage for authorization and CSRF.
 *
 * Often when making requests the same credentials or CSRF token needs
 * to be used. This is a place to store these details. Currently
 * accepts "csrf" and "bearer" values. Upon initialisation cookies
 * are examined for a current value for the CSRF token (looks for
 * a cookie called "csrftoken").
 */
let ajaxSettings = {
  csrf: Cookies ? Cookies.get('csrftoken') : undefined,
  bearer: null
}

function makeHeaders(opts) {
  let {
    method = 'get',
    contentType = contentTypes.json,
    extraHeaders,
    useBearer = true,
    bearer
  } = opts || {}
  let headers = {
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (contentType !== contentTypes.multiForm) {
    headers['Content-Type'] = contentType
  }
  if (!isEmpty(ajaxSettings.csrf) && !(/^(GET|HEAD|OPTIONS\TRACE)$/i.test(method))) {
    headers['X-CSRFToken'] = ajaxSettings.csrf
  }
  if (!bearer) {
    bearer = ajaxSettings.bearer
  }
  if (useBearer && bearer) {
    headers.Authorization = `Bearer ${bearer}`
  }
  headers = {
    ...headers,
    ...extraHeaders
  }
  return headers
}

/**
 * Construct headers for a fetch request.
 *
 * Uses the HTML5 Headers object to formulate an appropriate set of
 * headers based on the supplied options.
 *
 * @param {string} method - The request method. Defaults to "get".
 * @param {string} contentType - The content type of the request. Defaults to "application/json".
 * @param {object} extraHeaders - Custom headers to add.
 * @param {boolean} useBearer - Flag indicating whether to include bearer authorization.
 */
function fetchHeaders(opts) {
  return new Headers(makeHeaders(opts))
}

function makeRequest( opts ) {
  const method = (opts.method || 'get').toUpperCase()
  const {
    url,
    body,
    contentType,
    extraHeaders,
    useBearer = true,
    bearer
  } = opts || {}
  let request = {
    url,
    method,
    headers: makeHeaders({
      method,
      contentType,
      extraHeaders,
      useBearer,
      bearer
    }),
    credentials: 'same-origin'
  }
  if( method != 'GET' && method != 'HEAD' && method != 'OPTIONS') {
    request.body = body
  }
  return request
}

/**
 * Perform an ajax request.
 *
 * Uses HTML5 fetch to perform an ajax request according to parameters
 * supplied via the options object.
 *
 * @param {string} url - The URL to make the request to.
 * @param {string} method - The request method. Defaults to "get".
 * @param {string} body - Data to be sent with the request.
 * @param {string} contentType - The content type of the request. Defaults to "application/json".
 * @param {object} extraHeaders - Custom headers to add.
 * @param {boolean} useBearer - Flag indicating whether to include bearer authorization.
 */
function ajax( opts ) {
  const method = (opts.method || 'get').toUpperCase()
  const {
    url,
    body,
    contentType,
    extraHeaders,
    useBearer = true,
    bearer
  } = opts || {}

  let requestInit = {
    method,
    headers: fetchHeaders({
      method,
      contentType,
      extraHeaders,
      useBearer,
      bearer
    }),
    credentials: 'same-origin'
  }
  if( method != 'GET' && method != 'HEAD' && method != 'OPTIONS') {
    requestInit.body = body
  }

  let request = new Request( url, requestInit )
  return fetch( request )
    .then( response => {
      if( !!response.ok ) {
        if( response.status == 204 ) {
          return {}
        }
        if( typeof TINYAPI_NODE !== 'undefined' && TINYAPI_NODE ) {
          return response
        }
        if( !!response.json ) {
          return response.json()
        }
        else {
          return response
        }
      }
      if( !!response.json ) {
        return response.json()
                       .catch( e => Object({ status: response.status }) )
                       .then( e => Promise.reject( e ) )
      }
      else {
        return response 
      }
    })
}

function ajaxWithRequest( opts ) {
  const {
    url,
    ...requestInit
  } = opts
  let request = new Request( url, requestInit )
  return fetch( request )
    .then( response => {
      if( !!response.ok ) {
        if( response.status == 204 ) {
          return {}
        }
        if( typeof TINYAPI_NODE !== 'undefined' && TINYAPI_NODE ) {
          return response
        }
        if( !!response.json ) {
          return response.json().then(data => ({
            data,
            response
          }))
        }
        else {
          return {response}
        }
      }
      if( !!response.json ) {
        const data = response.json()
                       .catch( e => Object({ status: response.status }) )
                             .then( e => Promise.reject( e ) )
        return {
          data,
          response
        }
      }
      else {
        return {response}
      }
    })
}

/**
 * Post JSON data.
 *
 * @param {string} url - The URL to make the request to.
 * @param {object} payload - Data to be sent with the request.
 * @param {string} contentType - The content type of the request. Defaults to "application/json".
 * @param {boolean} useBearer - Flag indicating whether to include bearer authorization.
 */
function postJson({ url, payload, contentType, useBearer }) {
  return ajax({
    url,
    method: 'post',
    body: JSON.stringify( payload || {} ),
    contentType,
    useBearer
  })
}

/**
 * Convert an object into HTML5 FormData.
 */
function makeFormData( payload ) {
  let body = new FormData()
  for( let k in (payload || {}) ) {
    body.append( k, payload[k] )
  }
  return body
}

/**
 * Post form data.
 *
 * @param {string} url - The URL to make the request to.
 * @param {object} payload - Data to be sent with the request.
 * @param {boolean} useBearer - Flag indicating whether to include bearer authorization.
 */
function postForm({ url, payload, useBearer }) {
  return ajax({
    url,
    body: makeFormData( payload ),
    method: 'post',
    useBearer
  })
}

export function takeFirst() {
  if (arguments) {
    for (const v of arguments) {
      if (v !== undefined)
        return v
    }
  }
}

export {
  addTrailingSlash,
  ajax,
  postJson,
  postForm,
  ajaxSettings,
  contentTypes,
  matchContentType,
  makeFormData,
  makeRequest,
  ajaxWithRequest,
  makeHeaders,
  fetchHeaders
}
