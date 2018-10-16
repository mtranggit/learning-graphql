const { authorizeWithGithub } = require('../lib')
const fetch = require('node-fetch')
const { ObjectID } = require('mongodb')
const { uploadStream } = require('../lib')
const path = require('path')

module.exports = {

  async postPhoto(parent, args, { db, currentUser, pubsub }) {
    if (!currentUser) {
      throw new Error('only authorized user can post a photo')
    }
    const newPhoto = {
      ...args.input,
      userID: currentUser.githubLogin,
      created: new Date()
    }
    const { insertedIds } = await db.collection('photos').insertOne(newPhoto)
    newPhoto.id = insertedIds[0]

    const toPath = path.join(__dirname, '../', 'assets', 'photos', `${newPhoto.id}.jpg`)

    const { stream } = await args.input.file
    await uploadStream(stream, toPath)

    return newPhoto
  },

  async tagPhoto(parent, args, { db }) {
    await db.collection('tags').replaceOne(args, args, { upsert: true})
    
    return db.collection('photos').findOne({ _id: ObjectID(args.photoID) })
  },

  async githubAuth(parent, { code }, { db, pubsub }) {
    const {
      message,
      access_token,
      avatar_url,
      login,
      name
    } = await authorizeWithGithub({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code
    })
    if (message) {
      throw new Error(message)
    }
    const latestUserInfo = {
      name,
      githubLogin: login,
      githubToken: access_token,
      avatar: avatar_url
    }
    const { ops:[user] } = await db
      .collection('users')
      .replaceOne({ githubLogin: login }, latestUserInfo, { upsert: true})

    return { user, token: access_token }
  },

  async addFakeUsers(parent, { count }, { db, pubsub }) {
    const randomUserApi = `https://randomuser.me/api/?results=${count}`
    const { results } = await fetch(randomUserApi).then(res => res.json())
    const users = results.map(r => ({
      githubLogin: r.login.username,
      name: `${r.name.first} ${r.name.last}`,
      avatar: r.picture.thumbnail,
      githubToken: r.login.sha1
    }))
    await db.collection('users').insertMany(users)

    const newUsers = await db.collection('users')
      .find()
      .sort({ _id: -1})
      .limit(count)
      .toArray()
    
    newUsers.forEach(newUser => pubsub.publish('user-added', {newUser}))

    return users
  },

  async fakeUserAuth(parent, { githubLogin }, { db }) {
    const user = await db.collection(usres).findOne({ githubLogin })
    if (!user) {
      throw new Error(`Cannot find user with githubLogin "${githubLogin}"`)
    }

    return {
      token: user.githubToken,
      user
    }
  }
}
