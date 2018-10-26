'use strict'

const express = require ('express');
const config  = require ('./config/config.js');
const path    = require ('path');
const log     = require ('./log.js');
const db      = require ('./db.js');

// set default environment

process.env.ENV = process.env.WEBSRV_ENV || 'dev';

// initialize logging system

log.init (config.logger);
log.info ('started env=%s root=%s', config.env, config.root);

// initialize database

db.open ();

// initialize server

const app = express ();

app.set ('db', db);

app.use (express.static (path.normalize (path.join (config.root, 'public'))));
app.use (log.httplog.bind (log));
app.use (log.httperr.bind (log));

app.options ("/*", function(req, res, next){
  res.header ('Access-Control-Allow-Origin', '*');
  res.header ('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header ('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.send (200);
});

app.all ('/*', function(req, res, next) {
  res.header ('Access-Control-Allow-Origin', '*');
  res.header ('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header ('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  next ();
});

// 'body parser'

app.use (function (req, res, next) {
  let data = '';
  req.setEncoding ('utf8');
  
  req.on ('data', function (chunk) { 
    data += chunk;
  });

  req.on ('end', function() {
    req.body = data;
    next();
  });
});

// routes

require ('./routes.js')(app);

// start server

app.listen (config.port, config.ip, function () {
   log.info ('Server listening on %s:%d, in %s mode', config.ip, config.port, config.env);
});
