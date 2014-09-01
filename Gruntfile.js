module.exports = function (grunt) {

	grunt.initConfig({
        coffee: {
            compile: {
                files: {
                    'index.js': 'index.coffee'
                }
            }
        }
	});

	grunt.loadNpmTasks("grunt-contrib-coffee");

};

