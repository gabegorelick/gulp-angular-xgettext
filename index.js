'use strict';

var gutil = require('gulp-util');
var through = require('through2');
var cheerio = require('cheerio');
var po = require('pofile');
var esprima = require('esprima');
var path = require('path');
var _ = require('lodash');

var escapeRegex = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g;

var pluginName = 'gulp-angular-gettext';

var mkAttrRegex = function (startDelim, endDelim) {
  var start = startDelim.replace(escapeRegex, '\\$&');
  var end = endDelim.replace(escapeRegex, '\\$&');

  if (start === '' && end === '') {
    start = '^';
  }

  return new RegExp(start + '\\s*(\'|"|&quot;)(.*?)\\1\\s*\\|\\s*translate\\s*' + end, 'g');
};

module.exports = function (config) {
  var options = _.extend({
    startDelim: '{{',
    endDelim: '}}',
    extensions: {
      '.htm': 'html',
      '.html': 'html',
      '.php': 'html',
      '.phtml': 'html',
      '.js': 'js'
    },
    fileReference: function (file/*, string, plural*/) {
      return file.path;
    },
    headers: function (/*file*/) {
      return {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding': '8bit'
      };
    }
  }, config);
  var attrRegex = mkAttrRegex(options.startDelim, options.endDelim);
  var noDelimRegex = mkAttrRegex('', '');

  var isValidStrategy = function (strategy) {
    return strategy === 'html' || strategy === 'js';
  };

  for (var extension in options.extensions) {
    var strategy = options.extensions[extension];
    if (!isValidStrategy(strategy)) {
      throw new gutil.PluginError(pluginName, 'Invalid strategy ' + strategy + ' for extension ' + extension);
    }
  }

  var escape = function (str) {
    str = str.replace(/\\/g, '\\\\');
    str = str.replace(/"/g, '\\"');
    return str;
  };

  return through.obj(function (file, enc, cb) {
    if (file.isNull()) {
      this.push(file);
      return cb();
    }

    if (file.isStream()) {
      this.emit('error', new gutil.PluginError(pluginName, 'Streaming not supported'));
      return cb();
    }

    var failed = false;
    var catalog = new po();
    var strings = {};

    var stream = this;
    function addString(file, string, plural) {
      /*jshint camelcase: false */
      string = string.trim();

      var filename = options.fileReference(file, string, plural);

      if (!strings[string]) {
        strings[string] = new po.Item();
      }

      var item = strings[string];
      item.msgid = escape(string);
      if (item.references.indexOf(filename) < 0) {
        item.references.push(filename);
      }
      if (plural && plural !== '') {
        if (item.msgid_plural && item.msgid_plural !== plural) {
          stream.emit('error', new gutil.PluginError(pluginName, 'Incompatible plural definitions for ' +
            string + ': ' + item.msgid_plural + ' / ' + plural + ' (in: ' + (item.references.join(', ')) + ')'));
          failed = true;
        }
        item.msgid_plural = escape(plural);
        item.msgstr = ['', ''];
      }
    }

    function extractHtml(file) {
      /*jshint boss:true */
      var src = file.contents.toString();
      var $ = cheerio.load(src);

      $('*').each(function (index, n) {
        var node, plural, str, matches;
        node = $(n);

        for (var attr in node.attr()) {
          if (attr === 'translate') {
            str = node.html();
            plural = node.attr('translate-plural');
            addString(file, str, plural);
          } else if (matches = noDelimRegex.exec(node.attr(attr))) {
            addString(file, matches[2]);
          }
        }

        if (typeof node.attr('data-translate') !== 'undefined') {
          str = node.html();
          plural = node.attr('data-translate-plural');
          addString(file, str, plural);
        }
      });

      var matches;
      while (matches = attrRegex.exec(src)) {
        addString(file, matches[2]);
      }
    }

    function walkJs(node, fn) {
      fn(node);

      for (var key in node) {
        var obj = node[key];
        if (typeof obj === 'object') {
          walkJs(obj, fn);
        }
      }
    }

    var binaryExpressionWalkJs = function (node) {
      var res = '';
      if (node.type === 'Literal') {
        res = node.value;
      }
      if (node.type === 'BinaryExpression' && node.operator === '+') {
        res += binaryExpressionWalkJs(node.left);
        res += binaryExpressionWalkJs(node.right);
      }
      return res;
    };

    function extractJs(file) {
      var src = file.contents.toString();
      var syntax = esprima.parse(src, {
        tolerant: true
      });

      walkJs(syntax, function (node) {
        if (node !== null &&
          node.type === 'CallExpression' &&
          node.callee !== null &&
          node.callee.name === 'gettext' &&
          node['arguments'] !== null &&
          node['arguments'].length) {

          var arg = node['arguments'][0];
          var str;
          switch (arg.type) {
            case 'Literal':
              str = arg.value;
              break;
            case 'BinaryExpression':
              str = binaryExpressionWalkJs(arg);
          }
          if (str) {
            addString(file, str);
          }
        }
      });
    }

    function isSupportedByStrategy(strategy, extension) {
      return (extension in options.extensions) && (options.extensions[extension] === strategy);
    }

    var extension = path.extname(file.path);
    if (isSupportedByStrategy('html', extension)) {
      extractHtml(file);
    }
    if (isSupportedByStrategy('js', extension)) {
      extractJs(file);
    }

    catalog.headers = options.headers(file) || {};

    for (var key in strings) {
      catalog.items.push(strings[key]);
    }

    catalog.items.sort(function (a, b) {
      return a.msgid.localeCompare(b.msgid);
    });

    if (!failed) {
      file.contents = new Buffer(catalog.toString());
    }

    this.push(file);
    cb();
  });
};
