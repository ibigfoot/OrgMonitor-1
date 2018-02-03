
const kue = require('kue-scheduler')
const url = require('url')

const scheduler = kue.createQueue({
    redis: process.env.REDISCLOUD_URL
});

const queue = kue.createQueue({
    restore:true,
    worker:true,
    redis: process.env.REDISCLOUD_URL
})

module.exports = {
    scheduler: scheduler,
    queue: queue
}
