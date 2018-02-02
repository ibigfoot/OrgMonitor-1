
var kue = require('kue-scheduler')
var url = require('url')

var scheduler = kue.createQueue({
    restore:true,
    worker:false,
    redis: process.env.REDIS_URL
});

//in separate process create an instance that will process works
var worker = kue.createQueue({
    restore:true,
    worker:true,
    redis: process.env.REDIS_URL
});

module.exports = scheduler
module.exports = worker