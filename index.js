const { readFileSync } = require('fs')
const path = require('path')
const { createServer } = require('http')

const { ApolloServer, PubSub } = require('apollo-server-express')
const express = require('express')
const { MongoClient } = require('mongodb')
const expressPlayground = require('graphql-playground-middleware-express').default
const depthLimit = require('graphql-depth-limit')
const { createComplexityLimitRule } = require('graphql-validation-complexity')

const resolvers = require('./resolvers')

require('dotenv').config()

const typeDefs = readFileSync('./typeDefs.graphql', 'UTF-8')

async function start() {
  const app = express()
  const MONGO_DB = process.env.DB_HOST
  const pubsub = new PubSub()
  let db
  
  try {
    const client = await MongoClient.connect(MONGO_DB, { useNewUrlParser: true })
    db = client.db()
  } catch (error) {
    console.log(`
    Mongo DB Host not found!
    please add DB_HOST environment variable to .env file

    exiting...
    `)
    process.exit(1)
  }

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    engine: true,
    validationRules: [
      depthLimit(5),
      createComplexityLimitRule(1000, {
        onCost: cost => console.log('query cost: ', cost)
      })
    ],
    context: async ({ req, connection }) => {
      const githubToken = req ? req.headers.authorization : connection.context.Authorization
      const currentUser = await db.collection('users').findOne({ githubToken })
      return { db, currentUser, pubsub }
    }
  })

  server.applyMiddleware({ app })

  app.get('/playgournd', expressPlayground({ endpoint: '/graphql'}))
  
  app.get('/', (req, res) => {
    const url = `https://github.com/login/oauth/authorize?client_id=${process.env.CLIENT_ID}&scope=user`
    res.end(`<a href="${url}">Sign In with Github</a>`)
  })

  app.use('/img/photos', express.static(path.join(__dirname, 'assets', 'photos')))

  const httpServer = createServer(app)
  server.installSubscriptionHandlers(httpServer)
  httpServer.timeout = 5000

  app.listen(process.env.PORT, () => console.log(`GraphQL Server is running at ${process.env.HOST}:${process.env.PORT}${server.graphqlPath}`))
}

start()