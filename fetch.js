(function(self) {
  'use strict';
  
  if (self.fetch) {
    return
  }

  var support = {
    searchParams: 'URLSearchParams' in self,
    iterable: 'Symbol' in self && 'iterator' in Symbol,
    blob: 'FileReader' in self && 'Blob' in self && (function() {
      try {
        new Blob()
        return true
      } catch(e) {
        return false
      }
    })(),
    formData: 'FormData' in self,
    arrayBuffer: 'ArrayBuffer' in self
  }

  if (support.arrayBuffer) {
    var viewClasses = [
      '[object Int8Array]',
      '[object Uint8Array]',
      '[object Uint8ClampedArray]',
      '[object Int16Array]',
      '[object Uint16Array]',
      '[object Int32Array]',
      '[object Uint32Array]',
      '[object Float32Array]',
      '[object Float64Array]'
    ]

    var isDataView = function(obj) {
      return obj && DataView.prototype.isPrototypeOf(obj)
    }

    var isArrayBufferView = ArrayBuffer.isView || function(obj) {
      return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
    }
  }

  function normalizeName(name) {
    if (typeof name !== 'string') {
      name = String(name)
    }
    if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
      throw new TypeError('Invalid character in header field name')
    }
    return name.toLowerCase()
  }

  function normalizeValue(value) {
    if (typeof value !== 'string') {
      value = String(value)
    }
    return value
  }

  // Build a destructive iterator for the value list
  function iteratorFor(items) {
    var iterator = {
      next: function() {
        var value = items.shift()
        return {done: value === undefined, value: value}
      }
    }

    if (support.iterable) {
      iterator[Symbol.iterator] = function() {
        return iterator
      }
    }

    return iterator
  }

  function Headers(headers) {
    this.map = {}

    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        this.append(name, value)
      }, this)
    } else if (Array.isArray(headers)) {
      headers.forEach(function(header) {
        this.append(header[0], header[1])
      }, this)
    } else if (headers) {
      for(var name in headers) {
        this.append(name, headers[name])
      }
    }
  }

  Headers.prototype.append = function(name, value) {
    name = normalizeName(name)
    value = normalizeValue(value)
    var oldValue = this.map[name]
    this.map[name] = oldValue ? oldValue+','+value : value
  }

  Headers.prototype['delete'] = function(name) {
    delete this.map[normalizeName(name)]
  }

  Headers.prototype.get = function(name) {
    name = normalizeName(name)
    return this.has(name) ? this.map[name] : null
  }

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(normalizeName(name))
  }

  Headers.prototype.set = function(name, value) {
    this.map[normalizeName(name)] = normalizeValue(value)
  }

  Headers.prototype.forEach = function(callback, thisArg) {
    for (var name in this.map) {
      if (this.map.hasOwnProperty(name)) {
        callback.call(thisArg, this.map[name], name, this)
      }
    }
  }

  Headers.prototype.keys = function() {
    var items = []
    this.forEach(function(value, name) { items.push(name) })
    return iteratorFor(items)
  }

  Headers.prototype.values = function() {
    var items = []
    this.forEach(function(value) { items.push(value) })
    return iteratorFor(items)
  }

  Headers.prototype.entries = function() {
    var items = []
    this.forEach(function(value, name) { items.push([name, value]) })
    return iteratorFor(items)
  }

  if (support.iterable) {
    Headers.prototype[Symbol.iterator] = Headers.prototype.entries
  }

  function consumed(body) {
    if (body.bodyUsed) {
      return Promise.reject(new TypeError('Already read'))
    }
    body.bodyUsed = true
  }

  function fileReaderReady(reader) {
    return new Promise(function(resolve, reject) {
      reader.onload = function() {
        resolve(reader.result)
      }
      reader.onerror = function() {
        reject(reader.error)
      }
    })
  }

  function readBlobAsArrayBuffer(blob) {
    var reader = new FileReader()
    var promise = fileReaderReady(reader)
    reader.readAsArrayBuffer(blob)
    return promise
  }

  function readBlobAsText(blob) {
    var reader = new FileReader()
    var promise = fileReaderReady(reader)
    reader.readAsText(blob)
    return promise
  }

  function readArrayBufferAsText(buf) {
    var view = new Uint8Array(buf)
    var chars = new Array(view.length)

    for (var i = 0; i < view.length; i++) {
      chars[i] = String.fromCharCode(view[i])
    }
    return chars.join('')
  }

  function bufferClone(buf) {
    if (buf.slice) {
      return buf.slice(0)
    } else {
      var view = new Uint8Array(buf.byteLength)
      view.set(new Uint8Array(buf))
      return view.buffer
    }
  }

  function Body() {
    this.bodyUsed = false

    this._initBody = function(body) {
      this._bodyInit = body
      if (!body) {
        this._bodyText = ''
      } else if (typeof body === 'string') {
        this._bodyText = body
      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
        this._bodyBlob = body
      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
        this._bodyFormData = body
      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
        this._bodyText = body.toString()
      } else if (support.arrayBuffer && support.blob && isDataView(body)) {
        this._bodyArrayBuffer = bufferClone(body.buffer)
        // IE 10-11 can't handle a DataView body.
        this._bodyInit = new Blob([this._bodyArrayBuffer])
      } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
        this._bodyArrayBuffer = bufferClone(body)
      } else {
        throw new Error('unsupported BodyInit type')
      }

      if (!this.headers.get('content-type')) {
        if (typeof body === 'string') {
          this.headers.set('content-type', 'text/plain;charset=UTF-8')
        } else if (this._bodyBlob && this._bodyBlob.type) {
          this.headers.set('content-type', this._bodyBlob.type)
        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
        }
      }
    }

    if (support.blob) {
      this.blob = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return Promise.resolve(this._bodyBlob)
        } else if (this._bodyArrayBuffer) {
          return Promise.resolve(new Blob([this._bodyArrayBuffer]))
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      }

      this.arrayBuffer = function() {
        if (this._bodyArrayBuffer) {
          return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
        } else {
          return this.blob().then(readBlobAsArrayBuffer)
        }
      }
    }

    this.text = function() {
      var rejected = consumed(this)
      if (rejected) {
        return rejected
      }

      if (this._bodyBlob) {
        return readBlobAsText(this._bodyBlob)
      } else if (this._bodyArrayBuffer) {
        return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
      } else if (this._bodyFormData) {
        throw new Error('could not read FormData body as text')
      } else {
        return Promise.resolve(this._bodyText)
      }
    }

    if (support.formData) {
      this.formData = function() {
        return this.text().then(decode)
      }
    }

    this.json = function() {
      return this.text().then(JSON.parse)
    }

    this.xml = function() {
      return this.text().then(function(text) {
        return new XML(text.replace(/<\?[^>]+\?>/,''))
      })
    }

    return this
  }

  // HTTP methods whose capitalization should be normalized
  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

  function normalizeMethod(method) {
    var upcased = method.toUpperCase()
    return (methods.indexOf(upcased) > -1) ? upcased : method
  }

  function Request(input, options) {
    options = options || {}
    var body = options.body

    if (input instanceof Request) {
      if (input.bodyUsed) {
        throw new TypeError('Already read')
      }
      this.url = input.url
      this.credentials = input.credentials
      if (!options.headers) {
        this.headers = new Headers(input.headers)
      }
      this.method = input.method
      this.mode = input.mode
      if (!body && input._bodyInit != null) {
        body = input._bodyInit
        input.bodyUsed = true
      }
    } else {
      this.url = String(input)
    }
    
    var url = /^(.*:)\/\/([A-Za-z0-9\-\.]+)(?::([0-9]+))?(.*)$/.exec(this.url)
    if(!url) throw new TypeError("Bad URL")
    this.protocol = url[1]
    this.host = url[2]
    this.port = parseInt(url[3]) || 80
    this.query = url[4]

    this.credentials = options.credentials || this.credentials || 'omit'
    if (options.headers || !this.headers) {
      this.headers = new Headers(options.headers)
    }
    this.method = normalizeMethod(options.method || this.method || 'GET')
    this.mode = options.mode || this.mode || null
    this.referrer = null

    if(typeof options.priority == 'number') this.priority = options.priority
    if(typeof options.deferTimeout == 'number') this.deferTimeout = options.deferTimeout

    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(body)
  }

  Request.prototype.clone = function() {
    return new Request(this, { body: this._bodyInit })
  }

  function decode(body) {
    var form = new FormData()
    body.trim().split('&').forEach(function(bytes) {
      if (bytes) {
        var split = bytes.split('=')
        var name = split.shift().replace(/\+/g, ' ')
        var value = split.join('=').replace(/\+/g, ' ')
        form.append(decodeURIComponent(name), decodeURIComponent(value))
      }
    })
    return form
  }

  function parseHeaders(rawHeaders) {
    var headers = new Headers()
    rawHeaders.split(/\r?\n/).forEach(function(line) {
      var parts = line.split(':')
      var key = parts.shift().trim()
      if (key) {
        var value = parts.join(':').trim()
        headers.append(key, value)
      }
    })
    return headers
  }

  Body.call(Request.prototype)

  function Response(bodyInit, options) {
    if (!options) {
      options = {}
    }

    this.type = 'default'
    this.status = 'status' in options ? options.status : 200
    this.ok = this.status >= 200 && this.status < 300
    this.statusText = 'statusText' in options ? options.statusText : 'OK'
    this.headers = new Headers(options.headers)
    this.url = options.url || ''
    this._initBody(bodyInit)
  }

  Body.call(Response.prototype)

  Response.prototype.clone = function() {
    return new Response(this._bodyInit, {
      status: this.status,
      statusText: this.statusText,
      headers: new Headers(this.headers),
      url: this.url
    })
  }

  Response.error = function() {
    var response = new Response(null, {status: 0, statusText: ''})
    response.type = 'error'
    return response
  }

  var redirectStatuses = [301, 302, 303, 307, 308]

  Response.redirect = function(url, status) {
    if (redirectStatuses.indexOf(status) === -1) {
      throw new RangeError('Invalid status code')
    }

    return new Response(null, {status: status, headers: {location: url}})
  }

  self.Headers = Headers
  self.Request = Request
  self.Response = Response

  var connection_pool = []
  connection_pool.handlers = {}
  connection_pool.deferred_requests = []
  connection_pool.num_handlers = 0
  
  function _connection_pool_onData(data, handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onData(data)
  }
  self._connection_pool_onData = _connection_pool_onData
  
  function _connection_pool_onConnectFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onConnect()
  }
  self._connection_pool_onConnectFunc = _connection_pool_onConnectFunc
  
  function _connection_pool_onConnectFailedFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onConnectFailed()
  }
  self._connection_pool_onConnectFailedFunc = _connection_pool_onConnectFailedFunc
  
  function _connection_pool_onDisconnectFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onDisconnect()
  }
  self._connection_pool_onDisconnectFunc = _connection_pool_onDisconnectFunc
  
  function _connection_pool_onSSLHandshakeOKFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onSSLHandshakeOK()
  }
  self._connection_pool_onSSLHandshakeOKFunc = _connection_pool_onSSLHandshakeOKFunc
  
  function _connection_pool_onSSLHandshakeFailedFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onSSLHandshakeFailed()
  }
  self._connection_pool_onSSLHandshakeFailedFunc = _connection_pool_onSSLHandshakeFailedFunc
  
  connection_pool.get = function(handler) {
    return new Promise(function(resolve, reject) {
      if(this.length) {
        resolve(this.pop())
      } else {
        // pool is empty
        if(self.fetch.max_http_objects > 0 && self.fetch.max_http_objects <= connection_pool.num_handlers && (handler.priority || 0) <= 9000) {
          // have to defer
          if(self.fetch.max_deferred_requests >= 0 && connection_pool.deferred_requests.length >= self.fetch.max_deferred_requests) {
            // we have connection_pool.num_handler ongoing connections + connection_pool.deferred_requests.length deferred requests
            reject(new Error("Maximum number of deferred requests reached"))
            return
          }

          var timed_out = false
          if(handler.deferTimeout) setTimeout(function() {
            timed_out = true
            reject(new Error("Timeout waiting for http object"))
          }, handler.deferTimeout)

          // ok, defer
          connection_pool.deferred_requests.push({ use: function(http) {
            if(timed_out) connection_pool.release(http)
            else {
              connection_pool.handlers[http.Handle] = handler
              connection_pool.num_handlers++
              resolve(http)
            }
          }, priority: handler.priority || 0 })
          connection_pool.deferred_requests.sort(function(a, b) { return b.priority - a.priority })
        } else {
          // create a new one, this permanently increases the pool size
          var http = new HTTP(_connection_pool_onData)
          http.OnConnectFunc = _connection_pool_onConnectFunc
          http.OnConnectFailedFunc = _connection_pool_onConnectFailedFunc
          http.OnDisconnectFunc = _connection_pool_onDisconnectFunc
          http.OnSSLHandshakeOKFunc = _connection_pool_onSSLHandshakeOKFunc
          http.OnSSLHandshakeFailedFunc = _connection_pool_onSSLHandshakeFailedFunc

          http.UseHandleInCallbacks = true

          connection_pool.handlers[http.Handle] = handler
          connection_pool.num_handlers++
          resolve(http)
        }
      }
    })
  }
  
  connection_pool.release = function(http) {
    delete connection_pool.handlers[http.Handle]
    connection_pool.num_handlers--
    http.Close()

    if(connection_pool.deferred_requests.length) {
      connection_pool.deferred_requests.shift().use(http)
    } else if(self.fetch.max_http_objects != 0) {
      connection_pool.push(http)
    }
  }

  self.fetch = function(input, init) {
    return new Promise(function(resolve, reject) {
      var request
      if (Request.prototype.isPrototypeOf(input) && !init) {
        request = input
      } else {
        request = new Request(input, init)
      }

      connection_pool.get(request).then(function(http) {
        request.onData = function(data) {
          connection_pool.release(http)
          
          var split = data.indexOf("\r\n\r\n")
          if (split == -1) {
            reject(new TypeError("Bad HTTP response"))
            return
          }
          var header = data.substr(0, split)
          data = data.substr(split + 4)
          var response = /^HTTP\/1\.[01] (\d+)\s(.+)\r\n([\s\S]+?)$/.exec(header)
          if(!response) {
            reject(new TypeError("Bad HTTP response"))
            return
          }
          var status = parseInt(response[1])
          if (status < 100 || status > 599) {
            reject(new TypeError('HTTP request failed'))
            return
          }
          var options = {
            status: status,
            statusText: response[2],
            headers: parseHeaders(response[3]),
            url: request.url
          }
          resolve(new Response(data, options))
        }
        
        request.onConnect = function() {
          if(request.protocol == 'https:') {
            if(!http.StartSSLHandshake()) request.onSSLHandshakeFailed()
          } else {
            request.onSSLHandshakeOK()
          }
        }
        
        request.onSSLHandshakeOK = function() {
          if(!request.headers.has("Host")) request.headers.set("Host", request.host)
          if(typeof request._bodyInit !== 'undefined') {
            request.headers.set("Content-Length", request._bodyInit.length)
          }
          
          var data = request.method + " " + request.query + " HTTP/1.1"
          var lastname
          request.headers.forEach(function(value, name) {
            if(name != lastname) {
              lastname = name
              data = data + "\r\n" + name + ": " + value
            } else {
              data = data + ";" + value
            }
          })

          if(typeof request._bodyInit !== 'undefined') {
            data = data + "\r\n\r\n" + request._bodyInit
          } else {
            data = data + "\r\n\r\n"
          }

          http.Write(data)
        }
        
        request.onSSLHandshakeFailed = function() {
          connection_pool.release(http)
          reject(new TypeError('SSL handshake failed'))
        }
        
        request.onConnectFailed = function() {
          connection_pool.release(http)
          reject(new TypeError('Network request failed'))
        }
        
        request.onDisconnect = function() {
          connection_pool.release(http)
        }

        http.Open(request.host, request.port)
        http.AddRxHTTPFraming()
      }, reject)
    })
  }
  self.fetch.polyfill = true
  self.fetch.max_http_objects = -1
  self.fetch.max_deferred_requests = -1
})(typeof self !== 'undefined' ? self : this)
