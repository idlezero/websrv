'use strict';

const config  = require ('./config/config.js');
const mongodb = require ((config.db.fake)? 'mongo-mock': 'mongodb');
const log     = require ('./log.js');

class DB {
   constructor () {
      this.conn = null;
      this.db   = null;

      if (config.db.fake) {
         mongodb.MongoClient.persist = config.db.fakedb.file;
      }
   }

   open () {
      var self = this;

      return new Promise (function (resolve, reject) {
         if (self.conn) {
            resolve ();
         }
         else {
            mongodb.MongoClient.connect (config.db.url, {useNewUrlParser: true})
               .then (function (conn) {
                  log.info ('[db] connected to db %s%s', config.db.name, (config.db.fake)? ' (fake)' : '');
                  self.conn = conn;
                  self.db   = conn.db (config.db.name);
                  resolve ();
               })
               .catch (function (err) {
                  log.error ('[db] failed to connect to db');
                  reject (err.message);
               });
         }
      });
   }

   close () {
      if (this.conn) {
         this.conn.close()
            .then (function () {
               log.info ('[db] closed');
            })
            .catch (function (err) {
               log.error ('[db] failed to close db connection: %s %s', err.message, err.stack);
            });
      }
   }

   getId (id) {
      return {_id: mongodb.ObjectId (id)};
   }

   oid (id) {
      return mongodb.ObjectId (id);
   }

   time2oid (time) {
      return mongodb.ObjectId ('' + time + '00000000');
   }
};

module.exports = new DB ();