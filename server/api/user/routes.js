'use strict';

const express = require ('express');
const log     = require ('../../log.js');
const db      = require ('../../db.js');
const router  = express.Router();

// note: the routing path for next CRUD handlers is combination of
//       root URL '/user' and paths defined below

// admin interface ------------------------------------------------------------

// get list of all users 

router.get ('/list', function (req, res) {
   try {
      db.db.collection ('user').find ().toArray ()
         .then ((list) => {
            res.send (list);
         })
         .catch ((err) => {
            log.error ('[db] get user collection failed: %s %s', err.message, err.stack);
            res.status (500).send();
         });
   }
   catch (err) {
      log.error ('exception: %s %j', err.message, err.stack);
      return res.status (500).send();
   }
});

// create an user
// request data: {name: <display name of the user>}

router.post ('/create', function (req, res) {
   let user;

   try {
      let data = JSON.parse (req.body);
      if (data.name) {
         user = {name: data.name};
      }
      else {
         throw new Error ('Invalid user name');
      }
   }
   catch (err) {
      log.error ('failed to parse request body: %s', err.message);
      return res.status (400).send ();
   }

   try {
      db.db.collection ('user').find ({name: user.name}).count()
         .then ((count) => {
            if (count === 0) {
               return db.db.collection ('user').insertOne (user);
            }
            else {
               let error = new Error ('User exists');
               error.code = 409;
               throw error;
            }
         })
         .then ((result) => {
            res.send (result.ops);
         })
         .catch ((err) => {
            let ecode = err.code || 500;
            log.error ('[db] create user failed: %s %j', err.message, err.stack);
            res.status (ecode).send ();
         });
   }
   catch (err) {
      log.error ('exception: %s %j', err.message, err.stack);
      return res.status (500).send();
   }
});

// get user by ID
// request data format: {id: <user ID>}

router.post ('/read', function (req, res) {
   let uid;

   try {
      let data = JSON.parse (req.body);

      if (data.id) {
         uid = db.oid (data.id);
      }
      else {
         throw new Error ('Missinng user ID');
      }
   }
   catch (err) {
      log.error ('Invalid User ID: %s', err.message);
      return res.status (400).send ();
   }

   try {
      db.db.collection ('user').findOne ({_id: uid})
         .then ((result) => {
            if (result) {
               res.send (result);
            }
            else {
               res.status (404).send ();
            }
         })
         .catch ((err) => {
            let ecode = err.code || 500;
            log.error ('[db] get user failed: %s %j', err.message, err.stack);
            res.status (ecode).send ();
         });
   }
   catch (err) {
      log.error ('exception: %s %j', err.message, err.stack);
      return res.status (500).send();
   }
});

// update user
// request data format: {id: <user ID>, name: <user name>}

router.post ('/update', function (req, res) {
   let uid, user;

   try {
      let data = JSON.parse (req.body);

      if (data.id) {
         uid = db.oid (data.id)
      }
      else {
         throw new Error ('Missing user ID');
      }

      if (data.name) {
         user = {$set: {name: data.name}}
      }
      else {
         throw new Error ('Missing user name');
      }
   }
   catch (err) {
      log.error ('failed to parse request body: %s', err.message);
      return res.status (400).send ();
   }

   try {
      db.db.collection ('user').updateOne ({_id: uid}, user, {upsert: false})
         .then ((result) => {
            if (result && result.matchedCount) {
               return db.db.collection ('user').findOne ({_id: uid});
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((result) => {
            return res.send (result);
         })
         .catch ((err) => {
            let ecode = err.code || 500;
            log.error ('[db] failed: %s %j', err.message, err.stack);
            res.status (ecode).send();
         });
   }
   catch (err) {
      log.error ('exception: %s %j', err.message, err.stack);
      return res.status (500).send();
   }
});

// delete users by requested filter
// filter format:
//   {
//     what: 'all'/'id'/'list'/'names'
//     list: <list of users IDs> OR
//     names: <list of names>
//   }
//
// where 'list' is an array of users IDs and 'names' is an array of users names

router.post ('/delete', function (req, res) {
   let data;

   try {
      data = JSON.parse (req.body);
   }
   catch (err) {
      log.error ('failed to parse request body: %s', err.message);
      return res.status (400).send();
   }

   let filter = {};

   try {
      if (data.what) {
         if (data.what === 'all') {
         }
         else if (data.what === 'id' && data.id) {
            filter._id = db.oid (data.id);
         }
         else if (data.what === 'list' && data.list) {
            if (data.list.length) {
               let ids = data.list.reduce ((acc, n) => {acc.push (db.oid (n)); return acc}, []);
               filter = {_id: {$in: ids}};
            }
            else {
               return res.status (200).send ({deleted: 0});
            }
         }
         else if (data.what === 'names' && data.names) {
            if (data.names.length) {
               let names = data.names.reduce ((acc, n) => {acc.push (n); return acc}, []);
               filter = {name: {$in: names}};
            }
            else {
               return res.status (200).send ({deleted: 0});
            }
         }
         else {
            var error = new Error ('Invalid filter');
            error.code = 400;
            throw error;
         }

         log.info ('delete users filter: %j', filter);

         db.db.collection ('user').deleteMany (filter)
            .then ((result) => {
               let count = (result && result.deletedCount)? result.deletedCount : 0;
               log.warn ('[db] users deleted: %s', count);
               res.status (200).send ({deleted: count});
            })
            .catch ((err) => {
               let ecode = err.code || 500;
               log.error ('[db] failed: %s %j', err.message, err.stack);
               res.status (ecode).send ();
            });
      }
      else {
         res.status (200).send ({deleted: 0});
      }
   }
   catch (err) {
      log.error ('delete user(s) failed: %s %j', err.message, err.stack);
      let ecode = err.code || 500;
      res.status (ecode).send ();
   }
});


// user interface -------------------------------------------------------------

// get user by ID

router.get ('/read/:uid', function (req, res) {
   let uid;

   try {
      uid = db.oid (req.params.uid);
   }
   catch (err) {
      log.error ('Invalid User ID: %s', err.message);
      return res.status (400).send ();
   }

   try {
      db.db.collection ('user').findOne ({_id: uid})
         .then ((result) => {
            if (result) {
               res.send (result);
            }
            else {
               res.status (404).send ();
            }
         })
         .catch ((err) => {
            let ecode = err.code || 500;
            log.error ('[db] get user failed: %s %j', err.message, err.stack);
            res.status (ecode).send ();
         });
   }
   catch (err) {
      log.error ('exception: %s %j', err.message, err.stack);
      return res.status (500).send();
   }
});

// update user by ID

router.post ('/update/:uid', function (req, res) {
   let uid, user;

   try {
      uid = db.oid (req.params.uid);
      let data = JSON.parse (req.body);

      if (data.name) {
         user = {$set: {name: data.name}}
      }
      else {
         throw new Error ('Invalid user');
      }
   }
   catch (err) {
      log.error ('failed to parse request body: %s', err.message);
      return res.status (400).send ();
   }

   try {
      db.db.collection ('user').updateOne ({_id: uid}, user, {upsert: false})
         .then ((result) => {
            if (result && result.matchedCount) {
               return db.db.collection ('user').findOne ({_id: uid});
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((result) => {
            return res.send (result);
         })
         .catch ((err) => {
            let ecode = err.code || 500;
            log.error ('[db] failed: %s %j', err.message, err.stack);
            res.status (ecode).send();
         });
   }
   catch (err) {
      log.error ('exception: %s %j', err.message, err.stack);
      return res.status (500).send();
   }
});


router.all ('/*?', function (req, res, next) {
   log.warn ('invalid request for resource "user": %s %s', req.method, req.url);
   res.contentType ('json');
   res.status (404).send ();
});

module.exports = router;