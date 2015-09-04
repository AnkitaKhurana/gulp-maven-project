var del                    = require('del'),
    gulp                   = require('gulp'),
    angularFilesort        = require('gulp-angular-filesort'),
    angularTemplateCache   = require('gulp-angular-templatecache'),
    bower                  = require('gulp-bower'),
    concat                 = require('gulp-concat'),
    expect                 = require('gulp-expect-file'),
    gulpIf                 = require('gulp-if'),
    gulpIgnore             = require('gulp-ignore'),
    inject                 = require('gulp-inject'),
    karma                  = require('karma').server,
    less                   = require('gulp-less'),
    livereload             = require('gulp-livereload'),
    merge                  = require('gulp-merge'),
    minifyHTML             = require('gulp-minify-html'),
    minifyCSS              = require('gulp-minify-css'),
    ngAnnotate             = require('gulp-ng-annotate'),
    runSequence            = require('run-sequence'),
    uglify                 = require('gulp-uglify'),
    watch                  = require('gulp-watch'),
    http                   = require('http'),
    httpProxy              = require('http-proxy'),
    serveStatic            = require('serve-static'),
    finalhandler           = require('finalhandler');


var ENV_PROD = "PROD";
var ENV_DEV = "DEV";
var ENV = ENV_DEV;

var DEPLOYMENT_NAME = "gulp-demo-project";
var MODULE_NAME = "angularApp";
var SOURCE_BASE_DIR = "src/main/ui";
var TARGET_DIR = "target/gulp-webapp";
var BUILD_BASE_DIR = TARGET_DIR + "/" + DEPLOYMENT_NAME;
var BOWER_DIR = TARGET_DIR + "/bower_components";

var PROXY_PATHS = [
  '/api/'
];


var source = {
  app : {
    files : [SOURCE_BASE_DIR + '/index.html'],
    watch : SOURCE_BASE_DIR + "/index.html"
  },
  scripts : {
    vendor : {
      name : "vendor.js",
      files : require('./vendor.json')
    },
    app : {
      files: [SOURCE_BASE_DIR + '/app/app.js', SOURCE_BASE_DIR + '/app/**/*.js'],
      watch: SOURCE_BASE_DIR + "/app/**"
    },
  },
  styles : {
    dir : SOURCE_BASE_DIR + '/less/',
    files : SOURCE_BASE_DIR + '/less/app.less',
    watch : [ SOURCE_BASE_DIR + '/less/**/*.less', SOURCE_BASE_DIR + '/less/**/*.css' ]
  },
  templates : {
    files : [ SOURCE_BASE_DIR + '/templates/*.html', SOURCE_BASE_DIR + '/templates/**/*.html' ],
    watch : SOURCE_BASE_DIR + "/templates/**"
  },
  index : {
    file : SOURCE_BASE_DIR + "/index.html"
  }
};

var build = {
  bower : {
    dir : BOWER_DIR
  },
  scripts : {
    dir : BUILD_BASE_DIR + "/js",
    vendor : { name : "vendor.js" },
    app : { name : "app.js" }
  },
  styles : {
    dir : BUILD_BASE_DIR + "/css",
    theme : { name : "styles.css" },
  },
  templates : {
    dir : BUILD_BASE_DIR + "/js",
    name : "templates.js",
    rootPath : "templates/"
  },
  index : {
    file : BUILD_BASE_DIR + "/index.html",
    ignore : "../../../target/gulp-webapp/" + DEPLOYMENT_NAME
  },
  dir : BUILD_BASE_DIR,
  watch : BUILD_BASE_DIR + "/**"
};


//////////////////////////////////
// Tasks
//////////////////////////////////

/**
 * Clean the webapp folder. Remove all the 
 */
gulp.task('clean', function(callback) {
  return del([ TARGET_DIR ], callback);
});

/**
 * Install bower components
 */
gulp.task('bowerInstall', function(callback) {
  return bower({ directory : BOWER_DIR });
});


/**
 * Concat all app scripts. Performs minification when running in prod mode
 */
gulp.task('scripts:app', function() {
  return gulp.src(source.scripts.app.files)
      .pipe(gulpIgnore.exclude("**/*Spec.js"))
      .pipe(gulpIf(ENV == ENV_PROD, concat(build.scripts.app.name)))
      .pipe(gulpIf(ENV == ENV_PROD), ngAnnotate())
      .pipe(gulpIf(ENV == ENV_PROD), uglify())
      .pipe(gulp.dest(build.scripts.dir));
});


/**
 * Combines all vendor/third-party scripts into a single minified vendor file
 */
gulp.task('scripts:vendor', function() {
  return gulp.src(source.scripts.vendor.files)
      .pipe(expect(source.scripts.vendor.files))
      .pipe(uglify())
      .pipe(concat(build.scripts.vendor.name))
      .pipe(gulp.dest(build.scripts.dir));
});


/**
 * Imports all templates into an angular template cache. If running in prod,
 * the templates are first minified 
 */
gulp.task('templates', function() {
  return gulp.src(source.templates.files)
      .pipe(gulpIf(ENV == ENV_PROD, minifyHTML()))
      .pipe(angularTemplateCache(build.templates.name, {
        module : MODULE_NAME, root : build.templates.rootPath
      }))
      .pipe(gulp.dest(build.templates.dir));
});

/**
 * Compiles app LESS files. If running in prod mode, files are minified.
 */
gulp.task('styles', function() {
  return gulp.src(source.styles.files)
      .pipe(less({paths : [BOWER_DIR, source.styles.dir]}))
      .pipe(gulpIf(ENV == ENV_PROD, minifyCSS({keepSpecialComments : 1})))
      .pipe(gulp.dest(build.styles.dir));
});


/**
 * Builds the index.html file. Adds in stylesheets and script tags
 */
gulp.task('app:index', function() {
  // Get all app sources and ensure they are included in the proper order for
  // the app to load (angularFileSor)
  var appScriptSources = gulp.src([build.dir + "/**/*.js"])
                             .pipe(gulpIgnore.exclude("**/" + build.scripts.vendor.name))
                             .pipe(angularFilesort());
  
  // Get the vendor script (which will need to go first) and stylesheets
  var otherSources = gulp.src([build.scripts.dir + "/" + build.scripts.vendor.name,
                               build.styles.dir + "/" + build.styles.theme.name,
                               build.styles.dir + "/*.css"], {read: false});
  
  var sources = merge(otherSources, appScriptSources);

  // Do the actual script/stylesheet injections into the index page
  return gulp.src(source.index.file)
      .pipe(inject(sources, { ignorePath: build.index.ignore, relative : true }))
      .pipe(gulpIf(ENV == ENV_PROD, minifyHTML()))
      .pipe(gulp.dest(build.dir));
});


/**
 * A watch task.  Starts up a livereload webserver
 */
gulp.task('watch', function() {
  
  /*
   * Separate watch globs are needed here because wildcarding such as ** /*.js
   * doesn't work when new files are added (https://github.com/floatdrop/gulp-watch/issues/29)
   */
  watch(source.scripts.app.watch,   function() { gulp.start('scripts:app'); gulp.start('app:index'); });
  watch(source.templates.watch,     function() { gulp.start('templates') });
  watch(source.styles.theme.watch,  function() { gulp.start('styles:theme') });
  watch(source.styles.custom.watch, function() { gulp.start('styles:custom') });
  watch(source.app.watch,           function() { gulp.start('app:index') });
  
  // Using livereload for listening because it's much more responsive than the
  // livereload found in the webserver
  livereload.listen();
  watch(build.watch, function(evt) {
    livereload.changed(evt);
  });

  gulp.start('serve');
});


gulp.task('serve', function(callback) {
  var numProxyConfigs = PROXY_PATHS.length;

  var serve = serveStatic(TARGET_DIR);  // static content handler
  var proxy = httpProxy.createProxyServer({ target : { host : 'localhost', port : '8080' }});  // proxy handler
  var server = http.createServer(function(req, res) {  // actual webserver
    for (var i = 0; i < numProxyConfigs; i++) {
      if (req.url.indexOf(PROXY_PATHS[i]) > -1) {
        return proxy.web(req, res, {
          target: 'http://localhost:8080'
        });
      }
    }

    if (req.url == "/") {
      res.writeHead(301, { 'Location': '/' + DEPLOYMENT_NAME + '/' });
      res.end();
      return;
    }

    var done = finalhandler(req, res)
    serve(req, res, done);
  });

  server.on('upgrade', function (req, socket, head) {
    proxy.ws(req, socket, head);
  });

  server.listen(8000);
});


/**
 * Execute karma tests
 */
gulp.task('test', function(callback) {
  return karma.start({
    configFile : __dirname + '/karma.conf.js',
    singleRun : true
  }, callback);
});

/**
 * Performs a full build. Processing of all scripts and css is done in parallel,
 * after which the index.html page is built.
 */
gulp.task('build', function(callback) {
  console.log("Build using environment: " + ENV);
  return runSequence('clean',
      'bowerInstall',
      ['styles', 'scripts:vendor', 'scripts:app', 'templates'],
      'app:index',
      'test',
      callback);
});


/**
 * Performs a full build for the production environment
 */
gulp.task('build:prod', function(callback) {
  ENV = ENV_PROD;
  return gulp.start('build', callback);
});


/**
 * The default task.  Performs a dev build and starts watching the files
 */
gulp.task('default', function(callback) {
  return runSequence('build', 'watch', callback);
});


// Error handler
function handleError(err) {
  console.log(err.toString());
  // this.emit('end');
}
