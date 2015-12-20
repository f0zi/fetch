(function(self) {
  'use strict';
  
  if (self.fetch) {
    return
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

  function Headers(headers) {
    this.map = {}

    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        this.append(name, value)
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
    var list = this.map[name]
    if (!list) {
      list = []
      this.map[name] = list
    }
    list.push(value)
  }

  Headers.prototype['delete'] = function(name) {
    delete this.map[normalizeName(name)]
  }

  Headers.prototype.get = function(name) {
    var values = this.map[normalizeName(name)]
    return values ? values[0] : null
  }

  Headers.prototype.getAll = function(name) {
    return this.map[normalizeName(name)] || []
  }

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(normalizeName(name))
  }

  Headers.prototype.set = function(name, value) {
    this.map[normalizeName(name)] = [normalizeValue(value)]
  }

  Headers.prototype.forEach = function(callback, thisArg) {
    for(var name in this.map) {
      this.map[name].forEach(function(value) {
        callback.call(thisArg, value, name, this)
      }, this)
    }
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
    reader.readAsArrayBuffer(blob)
    return fileReaderReady(reader)
  }

  function readBlobAsText(blob) {
    var reader = new FileReader()
    reader.readAsText(blob)
    return fileReaderReady(reader)
  }

  var support = {
    blob: 'FileReader' in self && 'Blob' in self && (function() {
      try {
        new Blob();
        return true
      } catch(e) {
        return false
      }
    })(),
    formData: 'FormData' in self,
    arrayBuffer: 'ArrayBuffer' in self
  }

  function Body() {
    this.bodyUsed = false


    this._initBody = function(body) {
      this._bodyInit = body
      if (typeof body === 'string') {
        this._bodyText = body
      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
        this._bodyBlob = body
      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
        this._bodyFormData = body
      } else if (!body) {
        this._bodyText = ''
      } else if (support.arrayBuffer && ArrayBuffer.prototype.isPrototypeOf(body)) {
        // Only support ArrayBuffers for POST method.
        // Receiving ArrayBuffers happens via Blobs, instead.
      } else {
        throw new Error('unsupported BodyInit type')
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
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      }

      this.arrayBuffer = function() {
        return this.blob().then(readBlobAsArrayBuffer)
      }

      this.text = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return readBlobAsText(this._bodyBlob)
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as text')
        } else {
          return Promise.resolve(this._bodyText)
        }
      }
    } else {
      this.text = function() {
        var rejected = consumed(this)
        return rejected ? rejected : Promise.resolve(this._bodyText)
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
    if (Request.prototype.isPrototypeOf(input)) {
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
      if (!body) {
        body = input._bodyInit
        input.bodyUsed = true
      }
    } else {
      this.url = input
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

    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(body)
  }

  Request.prototype.clone = function() {
    return new Request(this)
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

  function headers(allheaders) {
    var head = new Headers()
    var pairs = allheaders.trim().split('\n')
    pairs.forEach(function(header) {
      var split = header.trim().split(':')
      var key = split.shift().trim()
      var value = split.join(':').trim()
      head.append(key, value)
    })
    return head
  }

  Body.call(Request.prototype)

  function Response(bodyInit, options) {
    if (!options) {
      options = {}
    }

    this._initBody(bodyInit)
    this.type = 'default'
    this.status = options.status
    this.ok = this.status >= 200 && this.status < 300
    this.statusText = options.statusText
    this.headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers)
    this.url = options.url || ''
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

  self.Headers = Headers;
  self.Request = Request;
  self.Response = Response;
  
  var connection_pool = []
  connection_pool.handlers = {}
  
  function _connection_pool_onData(data, handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onData(data);
  }
  self._connection_pool_onData = _connection_pool_onData
  
  function _connection_pool_onConnectFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onConnect();
  }
  self._connection_pool_onConnectFunc = _connection_pool_onConnectFunc
  
  function _connection_pool_onConnectFailedFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onConnectFailed();
  }
  self._connection_pool_onConnectFailedFunc = _connection_pool_onConnectFailedFunc
  
  function _connection_pool_onDisconnectFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onDisconnect();
  }
  self._connection_pool_onDisconnectFunc = _connection_pool_onDisconnectFunc
  
  function _connection_pool_onSSLHandshakeOKFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onSSLHandshakeOK();
  }
  self._connection_pool_onSSLHandshakeOKFunc = _connection_pool_onSSLHandshakeOKFunc
  
  function _connection_pool_onSSLHandshakeFailedFunc(handle) {
    var handler = connection_pool.handlers[handle]
    if(handler) handler.onSSLHandshakeFailed();
  }
  self._connection_pool_onSSLHandshakeFailedFunc = _connection_pool_onSSLHandshakeFailedFunc
  
  connection_pool.get = function(handler) {
    if(this.length) { 
      var http = this.pop();
    } else {
      http = new HTTP(_connection_pool_onData)
      http.OnConnectFunc = _connection_pool_onConnectFunc
      http.OnConnectFailedFunc = _connection_pool_onConnectFailedFunc
      http.OnDisconnectFunc = _connection_pool_onDisconnectFunc
      http.OnSSLHandshakeOKFunc = _connection_pool_onSSLHandshakeOKFunc
      http.OnSSLHandshakeFailedFunc = _connection_pool_onSSLHandshakeFailedFunc

      http.UseHandleInCallbacks = true
    }
    connection_pool.handlers[http.Handle] = handler
    return http;
  }
  
  connection_pool.release = function(http) {
    delete connection_pool.handlers[http.Handle]
    http.Close()
    connection_pool.push(http)
  }

  self.fetch = function(input, init) {
    return new Promise(function(resolve, reject) {
      var request
      if (Request.prototype.isPrototypeOf(input) && !init) {
        request = input
      } else {
        request = new Request(input, init)
      }

      var http = connection_pool.get(request)
      request.onData = function(data) {
        connection_pool.release(http)
        
        var response = /^HTTP\/1\.[01] (\d+)\s(.+)\r\n([\s\S]+?)\r\n\r\n([\s\S]*)$/.exec(data)
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
          headers: headers(response[3]),
          url: request.url
        }
        resolve(new Response(response[4], options))
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
    })
  }
  self.fetch.polyfill = true
})(this);
