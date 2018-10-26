'use strict';

var path = require ('path');
var fs   = require ('fs');

var cfg = {
   env: process.env.WEBSRV_ENV,

   // root path of server

   root: path.normalize (__dirname + '/../..'),

   // server address

   ip:  'localhost',
   port: 7000,

   // database options (MongoDB)

   db: {
      url : 'mongodb://localhost:27017/dev',
      port: 27017,
      name: 'dev',
      options: {
         db: {
            safe: true
         }
      },
      fake: true,
      fakedb: {
         file: path.normalize (path.join (__dirname, '..', '..', 'logs', 'mongo.js')),
      }
   },

   // logger configuration

   logger: {
      logdb: false,
      level: 'debug',

      levels: {
         error: 0,
         warn:  1,
         info:  2,
         debug: 3,
      },

      labels: {
         error: '[e]',
         warn:  '[w]',
         info:  '[i]',
         debug: '[d]'
      },

      colors: {
         trace: 'magenta',  //'white',
         debug: 'blue',
         info:  'green',
         warn:  'yellow',
         error: 'red'
      },

      timestamp:  'YYYY-MM-DD HH:mm:ss.SSS',
      exceptions: true,
      source:     true,
      agent:      false, 

      transports: [
         {
            type:     'console',
            colorize:  'label',     // 'label', 'message', 'all'
            level:     'debug',
            timestamp: true
         }
      ],
   }
};

// attach winston file transport if configured

if (process.env.WEBSRV_LOG_FILE) {
    cfg.logger.transports.push ({
        type:      'file',
        level:     'debug',
        json:      false,
        filename:  path.normalize (process.env.WEBSRV_LOG_FILE), 
        timestamp: true,
        datePattern: 'YYYY_MM_DD',
        //zippedArchive: true,
    });
}

if (cfg.db.fake && cfg.db.fakedb.file) {
   let dirname = path.dirname (cfg.db.fakedb.file);

   fs.exists (dirname, function (exists) {
      if (!exists) {
         fs.mkdirSync (dirname);
      }
   });
}

module.exports = cfg;
