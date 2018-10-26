'use strict';

const express = require ('express');
const log     = require ('../../log.js');
const db      = require ('../../db.js');
const router  = express.Router();


// prepares filter for selecting range of notes based on time intervals
// defined with operators 'lt', 'lte', 'gt', 'gte'
// format of data:
//   {
//      lt : <time> OR
//      lte: <time> AND/OR
//      gt : <time> OR
//      gte: <time>
//   }
// where time is UTS time in UNIX format (number of milliseconds elapsed 
// since 1970.01.01 00:00:00)

function timeFilter (data) {
   let filter = {};

   try {
      let lt  = (data.lt )? {time: {$lt:  data.lt }} : null;
      let lte = (data.lte)? {time: {$lte: data.lte}} : null;
      let gt  = (data.gt )? {time: {$gt:  data.gt }} : null;
      let gte = (data.gte)? {time: {$gte: data.gte}} : null;

      if (lt && lte) lt = lte;
      if (gt && gte) gt = gte;

      lt = lt || lte;
      gt = gt || gte;

      if (lt) {
         filter = (gt)? {$and: [lt, gt]} : lt;
      }
      else if (gt) {
         filter = (lt)? {$and: [lt, gt]} : gt;
      }
      else {
         throw new Error ('Invalid filter');
      }
   }
   catch (err) {
      throw err;
   }

   return filter;
};


// note: the routing path for next CRUD handlers is combination of
//       root URL '/note' and paths defined below


// admin interface ------------------------------------------------------------

// retrieves list of notes according requested filter
// filter format:
//   {
//      what: 'all'/'user'/'time',
//      user: <userId> OR
//      time: {lte: <UTC time>, gte: <UTC time>}
//   }
//
// note: for exact time format see description of the timeFilter function

router.post ('/list', function (req, res) {
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
            // leave filter empty
         }
         else if (data.what === 'user' && data.user) {
            filter.user = data.user;
         }
         else if (data.what === 'time') {
            filter = timeFilter (data.time);
         }
         else {
            var error = new Error ('Invalid filter');
            error.code = 400;
            throw error;
         }
      }

      db.db.collection ('note').find (filter).toArray()
         .then ((list) => {
            res.send (list);
         })
         .catch ((err) => {
            log.error ('[db] get note collection failed: %s %j', err.message, err.stack);
            res.status (500).send();
         });
   }
   catch (err) {
      log.error ('/note/list failed: %d %s %j', err.code, err.message, err.stack);
      let ecode = err.code || 500;
      res.status (ecode).send ();
   }
});

// deletes notes from 'note' collection according requested filter
// filter format:
//   {
//      what: /'all'/'id'/'list'/'user'/'time',
//      id  : <noteId> OR
//      list: <an array of notes IDs> OR
//      user: <userId> OR
//      time: {lte: <UTC time>, gte: <UTC time>}
//   }
//
// note: for exact time format see description of the timeFilter function

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
         else if (data.what === 'user' && data.user) {
            filter.user = data.user;
         }
         else if (data.what === 'time') {
            filter = timeFilter (data.time);
         }
         else {
            var error = new Error ('Invalid filter');
            error.code = 400;
            throw error;
         }

         log.info ('delete notes filter: %j', filter);

         db.db.collection ('note', function (err1, collection) {
            collection.deleteMany (filter, function (err2, result) {
               let count = (result && result.deletedCount)? result.deletedCount : 0;
               log.warn ('[db] deleted notes: %s', count);
               res.status (200).send ({deleted: count});
            });
         });
      }
      else {
         res.status (200).send ({deleted: 0});
      }
   }
   catch (err) {
      log.error ('delete notes failed: %s %j', err.message, err.stack);
      let ecode = err.code || 500;
      res.status (ecode).send ();
   }
});


// user interface -------------------------------------------------------------

// creates note in 'note' collection
// expected body:
//   {title: <title>, text: <text>} 

router.post ('/:uid/create', function (req, res) {
   let uid = req.params.uid;
   let data;

   try {
      data = JSON.parse (req.body);
   }
   catch (err) {
      log.error ('failed to parse request body: %s', err.message);
      return res.status (400).send();
   }

   try {
      db.db.collection ('user').find ({_id: db.oid (uid)}).count()
         .then ((count) => {
            if (count == 1) {
               return db.db.collection ('note');
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((collection) => {
            return collection.insertOne ({
               user:  uid,
               title: data.title || '',
               text:  data.text || '',
               time:  Date.now ()
            });
         })
         .then ((result) => {
            let body = result.ops[0];
            return res.send (body);
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

// retrieves single note by note ID

router.get ('/:uid/read/:nid', function (req, res) {
   let uid, nid;

   try {
      uid = db.oid (req.params.uid);
      nid = db.oid (req.params.nid);
   }
   catch (err) {
      log.error ('invalid user or note ID');
      return res.status (400).send();
   }

   try {
      db.db.collection ('user').find ({_id: uid}).count()
         .then ((count) => {
            if (count == 1) {
               return db.db.collection ('note');
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((collection) => {
            return collection.findOne ({_id: nid});
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

// retrieves notes according applied filter
// filter format:
//   {
//      what: 'all'/'user'/'time',
//      user: <userId> OR
//      time: {lte: <UTC time>, gte: <UTC time>}
//   }
//
// note: 1. For exact time format see description of the timeFilter function.
//       2. This API request allows user to read arbitrary notes.
//          In real application it will be restricted to some set of notes,
//          like groups or containers user belongs to and has rights to read.

router.post ('/:uid/read', function (req, res) {
   let uid, data, filter = {};

   try {
      uid = db.oid (req.params.uid);
   }
   catch (err) {
      log.error ('invalid user ID');
      return res.status (400).send();
   }

   try {
      data = JSON.parse (req.body);

      if (data.what) {
         if (data.what === 'all') {
         }
         else if (data.what === 'user' && data.user) {
            filter.user = data.user;
         }
         else if (data.what === 'time') {
            filter = timeFilter (data.time);
         }
         else {
            throw new Error ('Invalid filter');
         }
      }
   }
   catch (err) {
      log.error ('parse filter failed: %s', err.message);
      return res.status (400).send();
   }

   try {
      db.db.collection ('user').find ({_id: uid}).count()
         .then ((count) => {
            if (count == 1) {
               return db.db.collection ('note');
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((collection) => {
            return collection.find (filter).toArray();
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

// updates a note
// format of the request body
//   {
//     "title": <title>, OR
//     "text":  <text>
//   }

router.post ('/:uid/update/:nid', function (req, res) {
   let uid, nid, data, update = {$set: {}};
   
   try {
      uid  = db.oid (req.params.uid);
      nid  = db.oid (req.params.nid);
      data = JSON.parse (req.body);

      if (!data.title && !data.text) throw new Error ('Invalid data');
      if (data.title) update.$set.title = data.title;
      if (data.text)  update.$set.text  = data.text;

      update.$set.user = req.params.uid;
      update.$set.time = Date.now ();
   }
   catch (err) {
      log.error ('update note failed: %s', err.message);
      return res.status (400).send ();
   }

   try {
      let notes;

      db.db.collection ('user').find ({_id: uid}).count()
         .then ((count) => {
            if (count == 1) {
               return db.db.collection ('note');
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((collection) => {
            notes = collection;
            return collection.updateOne ({_id: nid}, update, {upsert: false});
         })
         .then ((result) => {
            if (result && result.matchedCount) {
               return notes.findOne ({_id: nid});
            }
            else {
               let error = new Error ('Invalid note ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((note) => {
            return res.send (note);
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

// removes note by ID

router.get ('/:uid/delete/:nid', function (req, res) {
   let uid, nid;
   
   try {
      uid = db.oid (req.params.uid);
      nid = db.oid (req.params.nid);
   }
   catch (err) {
      log.error ('Invalid user and/or note ID: %s', err.message);
      return res.status (400).send ();
   }

   try {
      db.db.collection ('user').find ({_id: uid}).count()
         .then ((count) => {
            if (count == 1) {
               return db.db.collection ('note');
            }
            else {
               let error = new Error ('Invalid user ID');
               error.code = 400;
               throw error;
            }
         })
         .then ((collection) => {
            return collection.remove ({ _id: nid }, {justOne: true});
         })
         .then ((result) => {
            res.status (204).end ();
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
   log.warn ('invalid request for resource "note": %s %s', req.method, req.url);
   res.contentType ('json');
   res.status (404).send ();
});

module.exports = router;