# This module is deprecated. Please use [gulp-angular-gettext](https://www.npmjs.org/package/gulp-angular-gettext) instead.

# [gulp](http://gulpjs.com)-angular-xgettext

> Extract translatable strings into a .pot file using [angular-gettext](http://angular-gettext.rocketeer.be)

## Install

Install with [npm](https://npmjs.org/package/gulp-angular-xgettext)

```
npm install --save-dev gulp-angular-xgettext
```

## Examples

```
var gulp = require('gulp');
var xgettext = require('gulp-angular-xgettext');

gulp.task('pot', function () {
    return gulp.src(['src/partials/**/*.html', 'src/scripts/**/*.js'])
        .pipe(xgettext())
        .pipe(gulp.dest('po/'));
});
```
