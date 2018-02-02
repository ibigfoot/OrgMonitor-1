
const kue = require('kue-scheduler')
const url = require('url')

var scheduler = kue.createQueue({
    skipConfig: true,
    redis: process.env.REDIS_URL
});


module.exports = scheduler