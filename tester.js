
var kue = require('kue-scheduler');
var q = kue.createQueue({
    redis: process.env.REDISCLOUD_URL
});

var job = q.createJob('testJob', {data: 'here is  some data'})
            .attempts(3)
            .backoff(true)
            .priority(normal);
        
q.every('10 seconds', job);

q.process('testJob', function(job, done) {
    console.log('processing the job');
});