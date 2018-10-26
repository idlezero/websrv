'use strict';

module.exports = function (app) {
   app.use ('/user', require ('./api/user/routes.js'));
   app.use ('/note', require ('./api/note/routes.js'));
};