;(function($, window, document, undefined) {
  'use strict';

  // This is our public access point.
  $.jribbble = {};

  var ACCESS_TOKEN = null;
  var API_URL = 'https://api.dribbble.com/v1';

  // The types of shot lists that are available through the API.
  // The default shot list–retrieved by shots()–is any type.
  var SHOT_LIST_TYPES = [
    'animated',
    'attachments',
    'debuts',
    'playoffs',
    'rebounds',
    'teams'
  ];

  var ERROR_MSGS = {
    token: 'Jribbble: Missing Dribbble access token. Set one with $.jribbble.accessToken = YOUR_ACCESS_TOKEN. If you do not have an access token, you must register a new application at https://dribbble.com/account/applications/new',

    singular: function(str) {
      return str.substr(0, str.length - 1);
    },

    idRequired: function(resource) {
      return 'Jribbble: You have to provide a ' + this.singular(resource)
        + ' ID. ex: $.jribbble.%@("1234").'.replace(/%@/g, resource);
    },

    subResource: function(resource) {
      return 'Jribbble: You have to provide a ' + this.singular(resource)
        + ' ID to get %@. ex: $.jribbble.%@("1234").%@()'.replace(/%@/g, resource);
    },

    // A shot ID is required to get shot sub-resources.
    shotId: function(resource) {
      return 'Jribbble: You have to provide a shot ID to get %@. ex: $.jribbble.shots("1234").%@()'.replace(/%@/g, resource);
    },

    commentLikes: 'Jribbble: You have to provide a comment ID to get likes. ex: $.jribbble.shots("1234").comments("456").likes()'
  };

  // Provide an object of key: value params. Get back a URL encoded string if
  // params has keys.
  var parseParams = function(params) {
    var p = $.param(params);

    if (p) {
      return '?' + p;
    } else {
      return '';
    }
  };

  // TODO: Document this function ya dingus
  var negotiateArgs = function(args) {
    if (args.length !== 0) {
      var firstArg = args[0];
      var type = typeof firstArg;
      var params = {};

      // These are valid shot(s) ID types
      if (type === 'number' || type === 'string') {
        var list = SHOT_LIST_TYPES.indexOf(firstArg);

        // As a conveinence, you can pass the name of a shot list to shots()
        // Checking to see if the given firstArg is in that list.
        if (list > -1) {
          params.list = firstArg;
        } else {
          params.resource = firstArg;
        }
      } else if (type === 'object') {
        params = firstArg;
      }

      return params;
    }
  };

  var jribbbleBase = function() {
    var ext = $.extend({}, $.Deferred());

    var Queue = function() {
      this.methods = [];
      this.response = null;
      this.flushed = false;

      this.add = function(fn) {
        if (this.flushed) {
          fn(this.scope);
        } else {
          this.methods.push(fn);
        }
      };

      this.flush = function(scope) {
        if (this.flushed) {
          return;
        }

        this.scope = scope;
        this.flushed = true;

        while(this.methods[0]) {
          this.methods.shift()(scope);
        }

        return scope;
      };

      return this;
    };

    ext.queue = new Queue();
    ext.url = API_URL;

    ext.get = function() {
      if (!ACCESS_TOKEN) {
        console.error(ERROR_MSGS.token);

        return false;
      }

      $.ajax({
        type: 'GET',
        url: this.url,
        beforeSend: function(jqxhr) {
          jqxhr.setRequestHeader('Authorization', 'Bearer ' + ACCESS_TOKEN);
        },
        success: function(res) {
          this.resolve(res);
        }.bind(this),
        error: function(jqxhr) {
          this.reject(jqxhr);
        }.bind(this)
      });

      return this;
    }

    return ext;
  };

  $.jribbble.shots = function(undefined, opts) {
    var shotArgsNegotiated = negotiateArgs([].slice.call(arguments)) || {};
    var shotsParams = opts || {};

    // Because most shot subresources; likes, projects, buckets, etc. all do
    // pretty much the same thing, we can avoid repeating code by using
    // currying. For each subresource we call this function and pass it the name
    // of the resource, it returns jribbble API method for that resource.
    // Yay programming!
    var shotSubResource = function(resource) {
      return function(undefined, opts) {
        var negotiated = negotiateArgs([].slice.call(arguments)) || {};
        var params = opts || {};

        this.queue.add(function(self) {
          if (!self.shotId) {
            throw new Error(ERROR_MSGS.shotId(resource));
          }

          self.url += '/' + resource + '/';

          if (negotiated.resource) {
            self.url += negotiated.resource;
            delete negotiated.resource;
          }

          self.url += parseParams($.extend(negotiated, params));
        });

        return this;
      };
    };

    var Shots = function() {
      $.extend(this, jribbbleBase());

      this.url += '/shots/';

      this.queue.add(function(self) {
        if (shotArgsNegotiated.resource) {
          self.shotId = shotArgsNegotiated.resource;
          self.url += shotArgsNegotiated.resource;
          delete shotArgsNegotiated.resource;
        }

        self.url += parseParams($.extend(shotArgsNegotiated, shotsParams));
      });

      // Jribbble seems to need an async queue, because we need to run the
      // server request at the end of the chain, but we will never know how
      // long the chain is. This is a super hack way of "waiting" to make sure
      // the queue is stocked before we flush it.
      setTimeout(function() {
        this.queue.flush(this).get();
      }.bind(this));

      return this;
    };

    Shots.prototype.attachments = shotSubResource('attachments');
    Shots.prototype.buckets = shotSubResource('buckets');
    Shots.prototype.likes = shotSubResource('likes');
    Shots.prototype.projects = shotSubResource('projects');
    Shots.prototype.rebounds = shotSubResource('rebounds');

    // Comments is a slightly different subresource because it has it's own
    // likes subresource. Comments shares a number of things with the other
    // shot subresources, but I haven't been able to figure out how to use
    // the shotSubResource currying function here to reduce repitition because
    // of the likes subresource.
    // I think I could get that to work if I created comments as a new Object
    // like comments = new Comments(). Then likes could be added to the
    // prototype of the Comments instance?
    // TODO: Figure that out.
    // TODO: Allow opts for comments, they support pagination.
    Shots.prototype.comments = function(id) {
      this.queue.add(function(self) {
        if (!self.shotId) {
          throw new Error(ERROR_MSGS.shotId('comments'));
        }

        self.url += '/comments/' + (id || '');
      });

      this.likes = function(opts) {
        var params = opts || {};

        if (!id) {
          throw new Error(ERROR_MSGS.commentLikes);
        }

        this.queue.add(function(self) {
          self.url += '/likes/' + parseParams(params);
        });

        return this;
      };

      return this;
    };

    return new Shots();
  };

  // TODO: DRY
  $.jribbble.buckets = function(id) {
    if (!id || typeof id === 'object') {
      throw new Error(ERROR_MSGS.idRequired('buckets'));
    }

    var subResource = function(resource) {
      return function(opts) {
        this.queue.add(function(self) {
          self.url += '/' + resource + '/' + parseParams(opts || {});
        });

        return this;
      };
    }

    var Buckets = function() {
      $.extend(this, jribbbleBase());

      this.queue.add(function(self) {
        self.url += '/buckets/' + id;
      });

      // TODO: DRY
      setTimeout(function() {
        this.queue.flush(this).get();
      }.bind(this));

      return this;
    };

    Buckets.prototype.shots = subResource('shots');

    return new Buckets();
  };

  // TODO: DRY
  $.jribbble.projects = function(id) {
    if (!id || typeof id === 'object') {
      throw new Error(ERROR_MSGS.idRequired('projects'));
    }

    var subResource = function(resource) {
      return function(opts) {
        this.queue.add(function(self) {
          self.url += '/' + resource + '/' + parseParams(opts || {});
        });

        return this;
      };
    }

    var Projects = function() {
      $.extend(this, jribbbleBase());

      this.queue.add(function(self) {
        self.url += '/projects/' + id;
      });

      // TODO: DRY
      setTimeout(function() {
        this.queue.flush(this).get();
      }.bind(this));

      return this;
    };

    Projects.prototype.shots = subResource('shots');

    return new Projects();
  };

  $.jribbble.setToken = function(token) {
    ACCESS_TOKEN = token;
    return this;
  };
})(jQuery, window , document);
