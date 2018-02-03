
const kue = require('kue-scheduler')
const url = require('url')

var redisURL = process.env.REDISCLOUD_URL + '?ssl=true'
var scheduler = kue.createQueue({
    restore:true,
    worker:false,
    redis: process.env.REDISCLOUD_URL
});

var queue = kue.createQueue({
    restore:true,
    worker:true,
    redis: process.env.REDISCLOUD_URL
})

module.exports = {
    scheduler: scheduler,
    queue: queue
}
