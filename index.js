(function() {
  var Handlebars, Promise, R, coffee, debug, emblem, fs, getExtension, removeExtension, removePrefix, serveStatic, watch, watchAndParse;

  serveStatic = require('serve-static');

  watch = require('watch');

  Promise = require('bluebird');

  R = require('ramda');

  emblem = require('emblem');

  coffee = require('coffee-script');

  Handlebars = require('ember-template-compiler').EmberHandlebars;

  fs = Promise.promisifyAll(require('fs'));

  removePrefix = R.curry(function(prefix, path) {
    if (path.indexOf(prefix === 0)) {
      return path.substr(prefix.length);
    } else {
      return path;
    }
  });

  removeExtension = function(file) {
    return file.substr(0, file.lastIndexOf('.'));
  };

  getExtension = function(file) {
    return file.substr(file.lastIndexOf('.'));
  };

  debug = R.flip(R.tap)(console.log);

  watchAndParse = function(path, options, results, extensions, parser) {
    var filter, getName, parseFile, parseTree;
    getName = R.compose(removeExtension, removePrefix(path));
    filter = R.compose(R.rPartial(R.contains, extensions), getExtension);
    parseFile = function(file) {
      var name;
      name = getName(file);
      return results[name] = fs.readFileAsync(file, {
        encoding: 'utf8'
      }).then(function(data) {
        return parser(data, file, name);
      });
    };
    parseTree = R.compose(R.forEach(parseFile), R.filter(filter), R.keys);
    return watch.watchTree(path, options, function(file, curr, prev) {
      if (!curr && !prev) {
        return parseTree(file);
      } else if (curr.nlink === 0) {
        return delete results[getName(file)];
      } else {
        if (filter(file)) {
          return parseFile(file);
        }
      }
    });
  };

  module.exports = function(config) {
    var indexPage, js, mergePromises, staticFiles, templates;
    if (!config.stylesheets) {
      config.stylesheets = [];
    }
    if (!config.scripts) {
      config.scripts = [];
    }
    config.scripts = R.concat(config.scripts, ['templates.js', 'app.js']);
    templates = {};
    watchAndParse(config.path + '/templates/', {}, templates, ['.emblem', '.embl', '.hbars', '.handlebars'], function(data, file, name) {
      var compiled, ext;
      ext = getExtension(file);
      if (ext === '.emblem' || ext === '.embl') {
        compiled = emblem.precompile(Handlebars, data);
      } else {
        compiled = Handlebars.compile(data);
      }
      return "Ember.TEMPLATES[" + (JSON.stringify(name)) + "] = Ember.Handlebars.template(" + compiled + ");\n";
    });
    js = {};
    watchAndParse(config.path + "/", {
      ignoreDirectoryPattern: /(public|templates)/
    }, js, ['.js', '.coffee'], function(data, file, name) {
      var ext;
      ext = getExtension(file);
      if (ext === '.js') {
        return data + "\n";
      } else {
        return coffee.compile(data) + "\n";
      }
    });
    staticFiles = serveStatic(config.path + '/public');
    indexPage = ("<!doctype html5>\n<html><head><title>" + (config.title || '') + "</title>") + R.foldl(R.add, '', R.concat(R.map((function(c) {
      return "<link type='text/css' href='" + c + "' rel='stylesheet'/>";
    }), config.stylesheets), R.map((function(s) {
      return "<script type='text/javascript' src='" + s + "'></script>";
    }), config.scripts))) + "</head><body></body></html>";
    mergePromises = function(promiseMap) {
      return Promise.settle(R.values(promiseMap)).then(R.compose(R.foldl(R.add, ''), R.map(R.func('value'))));
    };
    return function(req, res, next) {
      switch (req.path) {
        case '/templates.js':
          return mergePromises(templates).then(function(d) {
            res.set('Content-Type', 'text/javascript');
            return res.send(d);
          });
        case '/app.js':
          return mergePromises(js).then(function(d) {
            res.set('Content-Type', 'text/javascript');
            return res.send(d);
          });
        case '/':
        case '/index.html':
        case '':
          return res.send(indexPage);
        default:
          return staticFiles(req, res, next);
      }
    };
  };

}).call(this);
