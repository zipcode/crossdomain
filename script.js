'use strict';

/*
 * WARNING: this is TOTALLY INSECURE
 *
 * An attacker who can embed your page within an iFrame can make arbitrary
 * requests.  Make sure you're okay with that, or start origin checking.
 */

/*
 * The dispatcher object.  It exposes `post` and `register`.
 *
 * dispatcher.post(target, request, arguments...)
 *   @param target A Window object to post a request to.
 *   @param request A method registered with that Window's dispatcher
 *   @param arguments Arbitrary serializable arguments
 *   @returns A promise containing the result of the RPC call.
 *
 * dispatcher.register(name, f)
 *   @param name A name to bind the function to
 *   @param f A function
 *   @returns dispatcher
 *
 * EXAMPLE
 *
 * dispatcher.register('hello', function (name) { return "hello, " + name })
 * dispatcher.post(window, 'hello', 'zip').then(function (data) { console.log(data) })
 * // Console prints "hello, zip"
 */

var dispatcher = (function () {
  /* A mapping of pending callbacks.  Keys are unique callback IDs.  Values are objects.
   * Required properties are `resolve` and `reject` callbacks.
   * We also include `time` and `id`.
   */
  var callbacks = {};

  /* A registry of functions created with `dispatcher.register`. */
  var methods = {};

  var dispatcher = {
    post: function (target, request) {
      if (target.postMessage === void 0) {
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
      /* Aside: two things are happening here: turning `arguments` into an Array
       * and removing the first two items.  Functions have a `call` method which
       * is the same as directly invoking the function, except `this` is set to
       * the first argument.  If you call [].slice(0), Javascript looks for [].slice
       * and then up the prototype chain to [].__proto__.slice, and then calls it with
       * `this` set to the object.  Since [] is an instance of Array, Array.prototype.slice
       * is the same function.  Thus, Array.prototype.slice.call(arguments, 2) is like calling
       * arguments.slice(2), if arguments was an instance of Array. Javascript.
       */

      var callback = {
        time: Date.now(),
        id: data.id,
      };

      var promise = new Promise(function (resolve, reject) {
        callback.resolve = resolve;
        callback.reject = reject;
      });

      /* Store the result promise and fire off the request */
      callbacks[data.id] = callback;
      target.postMessage(data, "*");

      return promise;
    },

    register: function(name, f) {
      methods[name] = f;
      return this;
    }
  }

  function handle(message) {
    if (typeof message != "object") {
      /* Clearly not for us */
      return;
    }
    /* Now we have to handle two kinds of things: requests for our own functions, and
     * callback responses.   Responses have `response` set to the `id` of the query, and
     * a `data` field.  We set `success` to true if this worked. */
    if (typeof message.data.response == "string" && callbacks[message.data.response] !== void 0) {
      var callback = callbacks[message.data.response];
      if (message.data.success === true) {
        callback.resolve(message.data.data);
      } else {
        callback.reject(message.data.data);
      }
      callbacks[message.data.response] = void 0;
    } else if (typeof message.data.request == "string") {
      /* Otherwise, we're handling a request */
      var f = methods[message.data.request];
      var response = {
        response: message.data.id,
      };

      /* If it's not registered, fail */
      if (f === void 0) {
        response.data = "Not found";
        message.source.postMessage(response, "*");
        return;
      }

      try {
        response.data = f.apply(null, message.data.arguments);
        response.success = true;
      } catch (e) {
        /* We can't serialize exceptions, so serialize the message.
         * Also we probably don't want to reveal too much about the stack anyway. */
        response.data = e.message;
      }

      /* Handle promises.  This is a bit of special casing.  It doesn't make sense
       * to serialize these, but we can connect the remote promise to our local one
       * instead. */
      if ((typeof response.data == "object") && response.data.then !== void 0) {
        var promise = response.data;
        response.data = void 0; /* Just some defensive coding */
        promise.then(function (result) {
          response.data = result;
          message.source.postMessage(response, "*");
        }, function (error) {
          response.success = void 0;
          response.data = error;
          message.source.postMessage(response, "*");
        });
        /* The callback will happen asynchronously so we return now */
        return;
      }

      /* Otherwise it's a normal callback, so off it goes */
      message.source.postMessage(response, "*");
    }
  }

  window.addEventListener("message", handle);

  return dispatcher;
})();

document.addEventListener("DOMContentLoaded", function(event) {
  dispatcher.register("echo", function () {
    return Array.prototype.splice.call(arguments,0);
  });

  dispatcher.register("error", function () {
    throw new Error("This always errors");
  });

  var input = document.getElementsByTagName("input")[0];
  dispatcher.register("update", function (text) {
    input.value = text;
  });

  var target;
  var iframe = document.getElementsByTagName("iframe")[0];
  if (iframe) {
    target = iframe.contentWindow;
  } else if (window !== window.parent) {
    target = window.parent;
  }

  input.addEventListener("input", function (event) {
    dispatcher.post(target, "update", input.value);
  })

});