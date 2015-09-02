
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
			var handler = _setTimeoutCallback.handlers[handle]
			delete _setTimeoutCallback.handlers[handle]
			if(handler) handler()
		}
		global._setTimeoutCallback = _setTimeoutCallback
		_setTimeoutCallback.handlers = {}
		
		function setTimeout(code, delay) {
			var timer = new Timer()
			timer.UseHandleInCallbacks = true
			
			if(typeof(code) == 'string') {
				_setTimeoutCallback.handlers[timer.Handle] = function() { eval(code) }
			} else if(typeof(code) == 'function') {
				_setTimeoutCallback.handlers[timer.Handle] = Function.prototype.bind.apply(code, undefined, Array.prototype.slice.call(arguments, 2))
			} else throw new TypeError("Invalid code passed to setTimeout")
			
			timer.Start(_setTimeoutCallback, delay)
			return timer
		}
		global.setTimeout = setTimeout
		
		function clearTimeout(timer) {
			timer.Stop()
			delete _setTimeoutCallback.handlers[timer.Handle]
		}
		global.clearTimeout = clearTimeout
	}
})(this)
