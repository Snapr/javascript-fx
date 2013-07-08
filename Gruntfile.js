module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        less: {
            compile: {
                files: {
                    "build/tmp/<%= pkg.name %>.css": "src/css/snaprfx.less"
                }
            }
        },
        cssmin: {
            minify: {
                files: {
                    'build/tmp/<%= pkg.name %>.min.css': ['build/tmp/<%= pkg.name %>.css']
                }
            }
        },
        concat: {
            options: {
                separator: ''
            },
            cssjs: {
                src: ['src/css/css.head.js', 'build/tmp/<%= pkg.name %>.min.css', 'src/css/css.foot.js'],
                dest: 'build/tmp/snaprfx.css.js'
            }
        },
        'closure-compiler': {
            compile: {
                closurePath: '/usr/local/opt/closure-compiler/libexec/',
                js: [
                        'src/libs/jpegmeta.js',
                        'src/snaprfx.core.js',
                        'src/snaprfx.utils.js',
                        'src/snaprfx.stickers.js',
                        'src/snaprfx.canvas.js',
                        'src/snaprfx.blender.js',
                        'src/snaprfx.filters.js',
                        'src/snaprfx.text.js',
                        'build/tmp/snaprfx.css.js'
                    ],
                jsOutputFile: 'build/<%= pkg.name %>.min.js',
                //maxBuffer: 500,
                options: {
                    compilation_level: 'SIMPLE_OPTIMIZATIONS',
                    language_in: 'ECMASCRIPT5',
                    externs: [
                        'src/libs/jquery-1.8.2.js'
                    ]
                },
                noreport: true
            }
        },
        clean: ["build/tmp"]
    });

    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-closure-compiler');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-clean');

    grunt.registerTask('default', ['less', 'cssmin', 'concat', 'closure-compiler', 'clean']);

};
