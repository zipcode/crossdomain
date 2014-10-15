'use strict';

/*
 * WARNING: this is TOTALLY INSECURE
 *
 * An attacker who can embed your page within an iFrame can make arbitrary
 * requests.  Make sure you're okay with that, or start origin checking.
 */

var Dispatcher = (function () {
  var instance;
  var callbacks = {};
  var methods = {};

  function Dispatcher() {
    if (this === void 0) {
      return Dispatcher.instance();
    }
    if (instance !== void 0) {
      throw new Error("Dispatcher initialized twice. Use Dispatcher.instance() instead of 'new'.");
    }

    window.addEventListener("message", this.handle);
  }

  Dispatcher.instance = function () {
    if (instance === void 0) {
      instance = new Dispatcher();
    }
    return instance;
  };

  Dispatcher.prototype = {
    post: function (target, request) {
      if (!target instanceof Window) {
        throw new Error("Bad method parameter for target.");
      }
      if (typeof request != "string") {
        throw new Error("Bad method parameter for request.");
      }
      var data = {
        id: btoa(Math.random()),
        request: request,
        arguments: Array.prototype.slice.call(arguments, 2),
      };

      var callback = {
        time: Date.now(),
        id: data.id,
      };

      var promise = new Promise(function (resolve, reject) {
        callback.resolve = resolve;
        callback.reject = reject;
      });

      callbacks[data.id] = callback;

      target.postMessage(data, "*");

      return promise;
    },

    handle: function (message) {
      if (typeof message != "object") {
        return;
      }
      if (typeof message.data.response == "string" && callbacks[message.data.response] !== void 0) {
        var callback = callbacks[message.data.response];
        if (message.data.success === true) {
          callback.resolve(message.data.data);
        } else {
          callback.reject(message.data.data);
        }
        if (callback.keep !== true) {
          callbacks[message.data.response] = void 0;
        }
      } else if (typeof message.data.request == "string") {
        var f = methods[message.data.request];
        var response = {
          response: message.data.id,
        };

        if (f === void 0) {
          response.data = "Not found";
          message.source.postMessage(response, "*");
          return;
        }

        try {
          response.data = f.apply(null, message.data.arguments);
          response.success = true;
        } catch (e) {
          response.data = e.message;
        }

        // Handle promises
        if (response.data.then !== void 0) {
          var promise = response.data;
          response.data = void 0;
          promise.then(function (result) {
            response.data = result;
            message.source.postMessage(response, "*");
          }, function (error) {
            response.success = void 0;
            response.data = error;
            message.source.postMessage(response, "*");
          });
          return;
        }

        message.source.postMessage(response, "*");
      }
    },

    register: function(name, f) {
      methods[name] = f;
      return this;
    }
  }

  return Dispatcher;
})();

document.addEventListener("DOMContentLoaded", function(event) {
  var dispatcher = new Dispatcher();

  dispatcher.register("echo", function () {
    return Array.prototype.splice.call(arguments,0);
  });

  dispatcher.register("error", function () {
    throw new Error("This always errors");
  });
});