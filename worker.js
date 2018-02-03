/*
  Copyright (c) 2017, salesforce.com, inc.
  All rights reserved.
  Licensed under the BSD 3-Clause license.
  For full license text, see LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
*/
const Org = require('./lib/org.js')
const queue = require('./lib/kue.js')

queue.process('refreshOrg', function(job, done) {
  const jobData = job.data
  
  let org = await Org.get(jobData.orgId)
  let data = await org.fetchRemoteData()
  await Org.saveData(data)
  done()
})

queue.process('deleteOldRecords', function(job, done) {
  console.log(`Deleting old records..`)
  await Org.deleteOldRecords()
  done()
})

function graceful () {
  console.log('Shutting down worker')
  queue.shutdown(10000, function(err) {
    console.log( 'Kue shutdown: ', err||'' );
    process.exit( 0 );
  })
}

process.on('SIGTERM', graceful)
process.on('SIGINT', graceful)
