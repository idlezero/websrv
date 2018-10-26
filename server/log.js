'use strict';

var winston = require ('winston');
var path    = require ('path');
var fs      = require ('fs');

require ('winston-daily-rotate-file');

// returns <file>.<line> of the caller

function getSrc () {
   var src = '';
   
   try {
      var frame = (new Error()).stack.split ('\n')[3];
      var line  = /.+ \((.+)\:(\d+)\:(\d+)\)/.exec (frame);
      src = line[1].split('\\').slice(-2).join('/') + '.' + line[2];
   }
   catch (ex) {
   }
   
   return src;
}

// returns current UTC date in format: 'YYYY-MM-DD hh:mm:ss.nnn'
   
function getDate () {
   var zeropad = function (val) {
      return (val < 10)? '0' + val : val;
   }
      
   var now = new Date();
   var Y   = now.getUTCFullYear();
   var M   = zeropad (now.getUTCMonth() + 1);
   var D   = zeropad (now.getUTCDate());
   var h   = zeropad (now.getUTCHours());
   var m   = zeropad (now.getUTCMinutes());
   var s   = zeropad (now.getUTCSeconds());
   var ms  = now.getUTCMilliseconds();
      
   ms = (ms < 10)? '00' + ms: (ms < 100)? '0' + ms : ms; 
   return Y + '-' + M + '-' + D + ' ' + h + ':' + m + ':' + s + '.' + ms;
}

// makes folder for log files

function mkdir (dirname) {
   fs.exists (dirname, function (exists) {
      if (!exists) {
         fs.mkdirSync (dirname);
      }
   });
}
   
// label formater - shows log level as label

const tag = winston.format ((info, opts) => {
   if (info.level) {
      info.label = opts.labels[info.level];
   }
   return info;
});

// log record formatter

const formater = winston.format.printf (info => {
   let exinfo = (info.exception)? '\nprocess: ' + JSON.stringify (info.process) + ' ' + JSON.stringify (info.os) : '';
   let src    = (info.src)? ' ' + info.src + ':' : '';
   return `${info.label} ${info.timestamp}|${src} ${info.message}` + exinfo;
});

// console log colorizer (copied from logform project)

const colors = require ('colors/safe');
const {LEVEL, MESSAGE, SPLAT} = require ('triple-beam');
const hasSpace = /\s+/;

class Colorizer {
   constructor (opts = {}) {
      if (opts.colors) {
         this.addColors (opts.colors);
      }

      this.options = opts;
   }

   // adds the colors Object to the set of allColors known by the Colorizer

   static addColors (clrs) {
      const nextColors = Object.keys (clrs).reduce ((acc, level) => {
         acc[level] = hasSpace.test (clrs[level])? clrs[level].split (hasSpace)  : clrs[level];
         return acc;
      }, {});

      Colorizer.allColors = Object.assign({}, Colorizer.allColors || {}, nextColors);
      return Colorizer.allColors;
   }

   addColors (clrs) {
      return Colorizer.addColors (clrs);
   }

   // performs multi-step colorization using colors/safe

   colorize (lookup, level, message) {
      if (typeof message === 'undefined') {
         message = level;
      }

      // if the color for the level is just a string
      // then attempt to colorize the message with it

      if (!Array.isArray(Colorizer.allColors[lookup])) {
         return colors[Colorizer.allColors[lookup]](message);
      }

      // if it is an Array then iterate over that Array, applying
      // the colors function for each item.

      for (let i = 0, len = Colorizer.allColors[lookup].length; i < len; i++) {
         message = colors[Colorizer.allColors[lookup][i]](message);
      }

      return message;
   }

   // colorizes part or entire log record of the given 'logform' info object

   transform (info, opts) {
      const lookup = info[LEVEL];

      if (opts.what === 'all') {
         if (info[MESSAGE]) {
            info[MESSAGE] = this.colorize (lookup, info[MESSAGE]);
         }
      }
      else if (opts.what === 'message') {
         if (info.message) {
            info.message = this.colorize (lookup, info.message);
         }
      }
      else {
         if (info.label) {
            info.label = this.colorize (lookup, info.label);
         }
      }

      return info;
   }
}


// the logger

class Logger {
   constructor() {
      var self = this;
      this.logger  = {};
      this.options = {};
   }

   // getter and setter for the level

   get level () {return this.logger.level}
   set level (value) {this.logger.level = value;}
   
   // logger initialization method
   
   init (options) {
      try {
         var params = {};

         options = options || {};
         this.options = options;

         // do not exit on error
         
         params.exitOnError = false;

         if (options.level) {
            params.level = options.level;
         }

         // set log levels

         if (options.levels) {
            params.levels = options.levels;
         }

         // set formatting

         const label     = tag ({labels: options.labels || Object.keys (options.levels).reduce ((acc, key) => {acc[key] = '[' + key + ']'; return acc;}, {})});
         const splat     = winston.format.splat();
         const simple    = winston.format.simple();
         const timestamp = winston.format.timestamp ({format: options.timestamp || 'YYYY-MM-DD HH:mm:ss'});

         let fmtconsole  = winston.format.combine (label, splat, simple, timestamp, formater);
         let fmtfile     = winston.format.combine (label, splat, simple, timestamp, formater);

         // set transports
         
         params.transports = [];

         for (var i = 0; i < options.transports.length; i++) {
            if (options.transports[i].timestamp) {
               options.transports[i].timestamp = getDate;
               options.transports[i].datePattern = '_YYYY_MM_DD';
            }
         
            if (options.exceptions) {
               options.transports[i].handleExceptions = true;
            }

            if (options.transports[i].type === 'console') {
               let colorize = options.transports[i].colorize;

               if (colorize) {
                  var colorizer = new Colorizer ({colors: options.colors, what: colorize});

                  if (colorize === 'label') {
                     fmtconsole = winston.format.combine (label, colorizer, splat, simple, timestamp, formater);
                  }
                  if (colorize === 'message') {
                     fmtconsole = winston.format.combine (label, colorizer, splat, simple, timestamp, colorizer, formater);
                  }
                  if (colorize === 'all') {
                     fmtconsole = winston.format.combine (label, colorizer, splat, simple, timestamp, formater, colorizer);
                  }
               }

               options.transports[i].format = fmtconsole;
               params.transports.push (new winston.transports.Console (options.transports[i]));
            }
            else if (options.transports[i].type === 'file') {
               mkdir (path.dirname (options.transports[i].filename));
               options.transports[i].format = fmtfile;
               params.transports.push (new winston.transports.DailyRotateFile (options.transports[i]));
            }
         }

         // set log methods

         if (options.levels) {
            var self = this;

            Object.keys (options.levels).forEach (function (method) {
               if (options.source) {
                  self[method] = function () {
                     var args = Array.from (arguments);
                     var info = {level: method, src: getSrc()};

                     if (args.length === 1) {
                        info.message = args[0];
                     }
                     else {
                        info.message = args.shift();
                        info[SPLAT] = args;
                     }

                     self.logger.log.call (self.logger, info);
                  }
               }
               else {
                  self[method] = function () {  
                     self.logger[method].apply (self.logger, arguments);
                  }
               }
            });
         }

         // create winston logger

         this.logger = winston.createLogger (params);

         // set event handlers

         this.logger.on ('error', function (err) {
            console.error ('[logger] failed: ' + err.toString());
         });
      }
      catch (ex) {
         console.error ('logger init failed: ' + ex.toString());
      }
   }
   
   // express middleware function for logging http requests and responses
   
   httplog (req, res, next) {
      var self = this;

      function logResponse () {
         try {
            var respTime   = Math.abs (new Date().getTime() - req._startTime);
            var statusText = /^.+ \d{3} ([a-zA-Z ]+)/.exec (res._header)[1] || '';
            
            res.removeListener ('finish', logResponse);
            res.removeListener ('close',  logResponse);
            
            self.logger.log ({
               level:   'info',
               message: '[send] %sres=%s %s time=%dms',
               [SPLAT]: [(peer !== '')? 'to=' + peer + ' ' : '', res.statusCode, statusText, respTime],
            });
         }
         catch (ex) {
            console.error ('[logger.httplog] log response failed: ' + ex.toString());
         }
      }

      try {
         var sock = req.socket;
         var peer = '';
         
         req._startTime = new Date().getTime();
         req._remoteAddress = sock.socket ? sock.socket.remoteAddress : sock.remoteAddress;

         if (req.socket._peername) {
            peer = req.socket._peername.address + ':' + req.socket._peername.port;
         }
         
         let info = {
            level:   'info',
            message: '[recv] %sreq=%s %s',
            [SPLAT]: [(peer !== '')? 'from=' + peer + ' ' : '', req.method, req.url],
         };

         if (self.options.agent) {
            info.message += ' useragent=%s';
            info[SPLAT].push (req.headers['user-agent']);
         }
          
         self.logger.log (info);

         res.on ('finish', logResponse);
         res.on ('close',  logResponse);
      }   
      catch (ex) {
         console.error ('[logger.httplog] log request failed: ' + ex.toString());
      }

      next ();
   }
   
   // express custom error handler
   
   httperr (err, req, res, next) {
      if (err) {
         this.error ('http error "%s" with stack "%s"', err.message, err.stack);
      }

      next (err);
   }
   
   // params: the 'info' object accepted from winston logger with properties: 
   //         'level', 'message', 'args' (an array of params for formatting string), 
   //         'src' = true, ...
   // note:   1. the value of 'args' property will be assigned to 'SPLAT' property
   //         2. if 'info.src' is true, the source of source location will be added
   //         3. the other logging methods like 'info', 'warn', 'error' are added 
   //            from 'init' method according configuration object 'levels'

   log (info) {
      if (info.args) {
         info[SPLAT] = info.args;
      }
      if (info.src) {
         info.src = getSrc ();
      }

      this.logger.log.call (this.logger, info);
   }
   
   setSrc (level) {
      var args = Array.from (arguments);
      var info = {level: level, src: getSrc()};

      if (args.length === 1) {
         info.message = args[0];
      }
      else {
         info.message = args.shift();
         info[SPLAT] = args;
      }

      this.logger.log.call (this.logger, info);
   }
}

Logger.prototype.Logger = Logger;

// export the singleton

module.exports = exports = new Logger ();

