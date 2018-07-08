require('dotenv').config()
const firebase = require('firebase')
const fetch = require('node-fetch')
const fs = require('fs')
const Queue = require('promise-queue-plus')
const debug = require('debug')('rebuild:script')

const queue = new Queue(7, {
  retry: 3,               //Number of retries
  retryIsJump: false,     //retry now?
  timeout: 0,
})

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

function encodeFirebaseKey(key) {
  return key
    .replace(/[.]/g, ',')
    .replace(/\//g, '__')
}

function decodeFirebaseKey(key) {
  return key
    .replace(/[,]/g, '.')
    .replace(/__/g, '/')
}

async function getFirebaseStore() {
  try {
    const snapshot = await firebase.database()
      .ref('modules-v2')
      .once('value')
    return snapshot.val()
  } catch (err) {
    console.log(err)
    return {}
  }
}

async function getPackageResult({name, version}) {
  const ref = firebase.database().ref()
    .child('modules-v2')
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}


async function run() {
  const packages = []

  const packs = require('../db.json')//await getFirebaseStore()
  // fs.writeFileSync('./db.json', JSON.stringify(packs, null, 2))

  Object.keys(packs).forEach(packName => {
    Object.keys(packs[packName]).forEach(version => {
      console.log(`${packName}@${version}`)
      packages.push(`${decodeFirebaseKey(packName)}@${decodeFirebaseKey(version)}`)
    })
  })
  const failIndexes = []

  const startIndex = 16500
  const endIndex = 17000
  console.log('total packages', packages.length)

  packages
    .slice(startIndex, endIndex)
    .forEach((pack, index) =>
      queue.push(() => fetch(`http://127.0.0.1:5000/api/size?package=${pack}&force=true`)
        .then(async (r) => {
          debug('%s fetched %s', (startIndex + index).toLocaleString(), pack)
        })
        .catch((err) => {
          failIndexes.push(startIndex + index)
          console.log('fetch for ' + pack + ' failed', err)
          throw err
        }))
    )
  queue.start()
  fs.writeFileSync(`./failures-${startIndex}-${endIndex}.json`, JSON.stringify({failures: failIndexes}), 'utf8')

}

run()

