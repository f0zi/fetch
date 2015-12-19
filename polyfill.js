
if (!Function.prototype.bind) {
	Function.prototype.bind = function(oThis) {
		if (typeof this !== 'function') {
			// closest thing possible to the ECMAScript 5
			// internal IsCallable function
			throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
		}
		
		var aArgs   = Array.prototype.slice.call(arguments, 1),
			fToBind = this,
			fNOP    = function() {},
			fBound  = function() {
				return fToBind.apply(this instanceof fNOP
					? this
					: oThis,
					aArgs.concat(Array.prototype.slice.call(arguments)));
			};
		
		if (this.prototype) {
			// native functions don't have a prototype
			fNOP.prototype = this.prototype; 
		}
		fBound.prototype = new fNOP();
		
		return fBound;
	};
}

if (!String.prototype.trim) {
	String.prototype.trim = function () {
		return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
	};
}

(function(global) {
	if(!global.setTimeout) {
		function _setTimeoutCallback(handle) {
			var entry = _setTimeoutCallback.handlers[handle]
			delete _setTimeoutCallback.handlers[handle]
			if(entry && entry.handler) entry.handler()
		}
		global._setTimeoutCallback = _setTimeoutCallback
		_setTimeoutCallback.handlers = {}
		
		function setTimeout(code, delay) {
			var timer = new Timer()
			timer.UseHandleInCallbacks = true
			
			var entry = { timer: timer }
			if(typeof(code) == 'string') {
				entry.handler = function() { eval(code) }
			} else if(typeof(code) == 'function') {
				entry.handler = Function.prototype.bind.apply(code, undefined, Array.prototype.slice.call(arguments, 2))
			} else throw new TypeError("Invalid code passed to setTimeout")
			_setTimeoutCallback.handlers[timer.Handle] = entry
			
			timer.Start(_setTimeoutCallback, delay)
			return timer.Handle;
		}
		global.setTimeout = setTimeout
		
		function clearTimeout(handle) {
			var entry = _setTimeoutCallback.handlers[handle]
			delete _setTimeoutCallback.handlers[handle]
			if(entry && entry.timer) entry.timer.Stop()
		}
		global.clearTimeout = clearTimeout
	}
})(this)
