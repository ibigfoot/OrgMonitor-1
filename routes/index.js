/*
  Copyright (c) 2017, salesforce.com, inc.
  All rights reserved.
  Licensed under the BSD 3-Clause license.
  For full license text, see LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
*/

const express = require('express')
const router = express.Router()
const jsforce = require('jsforce')
// const _ = require('lodash')
const compare = require('secure-compare')
const Org = require('../lib/org.js')
const Crypto = require('../lib/crypto.js')
const oauth2model = require('../lib/oauth2.js')
const passport = require('passport')
const Promise = require('bluebird')

const scheduler = require('../lib/kue.js')

/* Saml */

const SAMLauthed = (req, res, next) => {
  if (req.isAuthenticated() || process.env.NODE_ENV === 'development') return next()
  res.redirect('/login')
}

router.get('/login', passport.authenticate('saml', { successRedirect: '/', failureRedirect: '/login' }))
router.post('/login/callback', passport.authenticate('saml', { successRedirect: '/', failureRedirect: '/login' }))

/* Setup */

router.get('/setup', SAMLauthed, async (req, res) => {
  const db = req.app.get('db')
  /* Create required tables */
  try {
    let kueJob = scheduler
                  .createJob('deleteOldRecords', {msg:'delete the old records'})
                  .attempts(3)
                  .backoff(true)
                  .priority('normal')
                  .unique('unique_every')
    console.log('~~ attempting to schedule deleteOldRecords job')
    scheduler.every('* * * * *', kueJob)

    await db.createDocumentTable('creds')
    await db.createDocumentTable('orgsdata')
    console.log(`Successfully setup DB`)
    res.json({ success: true, todo: 'Restart app now' })
    // TODO - should look to refresh the DB automatically, i.e. db.reload() and pass it to modules
  } catch (e) {
    console.log(`Error while setting up DB`, e)
    res.json({ success: false, error: e.message })
  }
})

/* Oauth */

router.get('/add/:type', (req, res) => {
  let oauth2 = oauth2model
  let loginUrl = 'https://login.salesforce.com'
  if (req.params.type === 'sandbox') loginUrl = 'https://test.salesforce.com'
  oauth2.loginUrl = loginUrl
  res.redirect(new jsforce.OAuth2(oauth2).getAuthorizationUrl({ scope: 'api refresh_token' }))
})

router.get('/callback', async (req, res) => {
  const code = req.query.code
  const conn = new jsforce.Connection({ oauth2: new jsforce.OAuth2(oauth2model) })

  try {
    await conn.authorize(code)
  } catch (e) {
    return res.json({ success: false, error: e.message }) // invalid grant
  }

  const userInfo = await conn.identity()
  const db = req.app.get('db')

  let env = {
    username: userInfo.username,
    orgId: userInfo.organization_id,
    instanceUrl: conn.instanceUrl,
    loginUrl: conn.loginUrl,
    refreshToken: Crypto.encrypt(conn.refreshToken),
    healthCheckScore: 'Syncing..'
  }

  // Store credentials in DB
  try {
    let credentials = await db.creds.findDoc({ orgId: userInfo.organization_id })
    if (credentials.length > 0) env.id = credentials[0].id
    await db.creds.saveDoc(env) // create or update
    console.log(`[${env.orgId}] Successfully stored credentials`)
  } catch (e) {
    console.error(`[${env.orgId}] Error while storing credentials`, e)
    return res.json({ success: false, error: e.message })
  }

  // Schedule data refresh job
  try {

    let kueJob = scheduler
      .createJob('refreshOrg', {orgId: env.orgId})
      .attempts(3)
      .backoff(true)
      .priority('normal')
      .unique('unique_every')

      scheduler.every('* * * * *', kueJob)

  } catch (e) {
    console.error(`[${env.orgId}] Error while scheduling job`, e)
    return res.json({ success: false, error: e.message })
  }

  res.redirect('/get')
})

/* Other routes */







router.get('/test/:testName', SAMLauthed, (req, res) => {
  const name = req.params.testName
  console.log(`We are testing scheduling job ${testName}`)
  /*
  try {
    let kueJob = scheduler 
              .createJob('testJob', {msg: `new job named ${testName}`})
              .attempts(3)
              .backoff(true)
              .priority('normal')
              .unique('unique_every')

    scheduler.every('* * * * *', kueJob)

    return res.json({success: true, msg: `Successfully created the job ${kueJob}`})

  } catch (e) {
    console.error(`${e.message}`)
    return res.json({success:false, error: e.message})
  }
  */
  return res.json({success: true, msg: `Successfully created the job ${kueJob}`})
})





router.get('/', SAMLauthed, (req, res) => {
  res.redirect('/get')
})

router.get('/rank', SAMLauthed, async (req, res) => {
  const orgs = await Org.getAllCreds()
  let orgsData = await Promise.map(orgs, async org => {
    return org.getData()
  })
  res.render('rank', {
    orgs: orgsData
  })
})

router.get('/get', SAMLauthed, async (req, res) => {
  try {
    const creds = await Org.getAllCreds()
    res.render('orgs', {
      creds: creds
    })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

router.get('/get/:orgId', SAMLauthed, async (req, res) => {
  const orgId = req.params.orgId
  try {
    const org = await Org.get(orgId)
    const dbdata = await org.getData()
    res.render('org', {
      org: org, // needed for name and username
      orgData: dbdata // actual data
    })
  } catch (e) {
    res.json({ success: false, err: e.message })
  }
})

router.get('/json/:orgId', SAMLauthed, async (req, res) => {
  const orgId = req.params.orgId
  try {
    const org = await Org.get(orgId)
    let dbdata = await org.getData()
    res.json(dbdata)
  } catch (e) {
    res.json({ success: false, err: e.message })
  }
})

/* Admin functions */

router.post('/wipe/:orgId', async (req, res) => {
  const adminToken = req.get('Admin-Token')
  if (!compare(adminToken, process.env.ADMIN_TOKEN)) return res.json({ success: false, err: 'Invalid token' })
  const orgId = req.params.orgId
  try {
    await Org.delete(orgId)
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, err: e })
  }
})

router.post('/edit/:orgId', async (req, res) => {
  // i.e. { "attributes": [{ "name": "Some attribute", "color": "blue" }, { "name": "Some other attribute", "color": "black" }] }
  const orgId = req.params.orgId
  const adminToken = req.get('Admin-Token')
  if (!compare(adminToken, process.env.ADMIN_TOKEN)) return res.json({ success: false, err: 'Invalid token' })

  let data = req.get('Data')
  try {
    data = JSON.parse(data)
  } catch (e) {
    return res.json({ success: false, error: 'Invalid data' })
  }

  try {
    let org = await Org.get(orgId)
    await org.set(data)
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, err: e.message })
  }
})

router.post('/refresh', async(req, res) => {
  const adminToken = req.get('Admin-Token')
  if (!compare(adminToken, process.env.ADMIN_TOKEN)) return res.json({ success: false, err: 'Invalid token' })
  const creds = await Org.getAllCreds()
  creds.map(async cred => {
    let org = await Org.get(cred.orgId)
    let data = await org.fetchRemoteData()
    await Org.saveData(data)
  })
  res.send({ success: true })
})

router.post('/reschedule', async (req, res) => {
  const adminToken = req.get('Admin-Token')
  if (!compare(adminToken, process.env.ADMIN_TOKEN)) return res.json({ success: false, err: 'Invalid token' })
  try {
    const creds = await Org.getAllCreds()
    creds.map(async cred => {

      let kueJob = scheduler
        .createJob('refreshOrg', {msg:'this will refresh the org', orgId: cred.orgId})
        .attempts(3)
        .backoff(true)
        .priority('normal')

      scheduler.every('* * * * *', kueJob)

      console.log(`[${cred.orgId}] Successfully scheduled job`)
    })
    res.send({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

module.exports = router
