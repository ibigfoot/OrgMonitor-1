
const kue = require('kue-scheduler')
const url = require('url')

var redisURL = process.env.REDISCLOUD_URL + '?ssl=true'
var scheduler = kue.createQueue({
    skipConfig: true,
    redis: process.env.REDISCLOUD_URL
});


module.exports = scheduler