serveStatic = require 'serve-static'
watch = require 'watch'
Promise = require 'bluebird'
R = require 'ramda'
emblem = require 'emblem'
coffee = require 'coffee-script'
Handlebars = require('ember-template-compiler').EmberHandlebars
fs = Promise.promisifyAll require 'fs'

removePrefix = R.curry (prefix, path) ->
	if (path.indexOf prefix == 0)
		path.substr prefix.length
	else
		path

removeExtension = (file) -> file.substr 0, file.lastIndexOf '.'

getExtension = (file) -> file.substr file.lastIndexOf '.'
		
debug = R.flip(R.tap)(console.log)

watchAndParse = (path, options, results, extensions, parser) ->
	getName = R.compose removeExtension, removePrefix path

	filter = R.compose(R.applyRight(R.contains,extensions),getExtension)

	parseFile = (file) ->
		name = getName file
		results[name] = fs.readFileAsync(file, encoding: 'utf8').then (data) -> parser data, file, name

	parseTree = R.compose R.each(parseFile), R.filter(filter), R.keys

	watch.watchTree path, options, (file, curr, prev) ->
		if !curr && !prev
			parseTree file
		else if curr.nlink == 0
			delete results[getName file]
		else
			parseFile file if filter file

module.exports = (config) ->

	if !config.stylesheets then config.stylesheets = []
	if !config.scripts then config.scripts = []
	config.scripts = R.concat config.scripts, ['templates.js', 'app.js']

	templates = {}
	watchAndParse config.path + '/templates/', {}, templates, ['.emblem','.embl','.hbars','.handlebars'],
		(data, file, name) ->
			ext = getExtension file
			if ext in ['.emblem','.embl']
				compiled = emblem.precompile Handlebars, data
			else
				compiled = Handlebars.compile data
			"Ember.TEMPLATES[#{JSON.stringify name}] = Ember.Handlebars.template(#{compiled});\n"

	js = {}
	watchAndParse config.path + "/", ignoreDirectoryPattern: /(public|templates)/, js, ['.js', '.coffee'],
		(data, file, name) ->
			ext = getExtension file
			if ext in ['.js']
				data + "\n"
			else
				coffee.compile(data) + "\n"

	staticFiles = serveStatic config.path + '/public'

	indexPage = "<!doctype html5>\n<html><head><title>#{config.title || ''}</title>" + R.foldl(R.add, '', R.concat(
		R.map(((c) -> "<link type='text/css' href='#{c}' rel='stylesheet'/>"), config.stylesheets) ,
		R.map(((s) -> "<script type='text/javascript' src='#{s}'></script>"), config.scripts) 
	)) + "</head><body></body></html>"

	mergePromises = (promiseMap) ->
		Promise.settle(R.values promiseMap).then R.compose R.foldl(R.add, ''), R.map R.func('value')

	(req, res, next) ->
		switch req.path
			when '/templates.js'
				mergePromises(templates).then (d) ->
					res.set 'Content-Type', 'text/javascript'
					res.send(d)
			when '/app.js'
				mergePromises(js).then (d) ->
					res.set 'Content-Type', 'text/javascript'
					res.send(d)
			when '/', '/index.html', ''
				res.send indexPage
			else 
				staticFiles req, res, next


