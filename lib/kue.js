
const kue = require('kue-scheduler')
const url = require('url')

var scheduler = kue.createQueue({
    skipConfig: true,
    redis: process.env.REDIS_URL
});

scheulder.
//in separate process create an instance that will process works
var worker = kue.createQueue({
    skipConfig: true,
    redis: process.env.REDIS_URL
});

module.exports = scheduler
module.exports = worker