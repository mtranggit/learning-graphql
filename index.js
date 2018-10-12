// import express from 'express'
// import { MongoClient } from 'mongodb'
// import { readFileSync } from 'fs'
// import expressPlayground from 'graphql-playground-middleware-express'
const { ApolloServer } = require('apollo-server-express')
const express = require('express')
const { MongoClient } = require('mongodb')
const { readFileSync } = require('fs')
const expressPlayground = require('graphql-playground-middleware-express').default

const resolvers = require('./resolvers')

require('dotenv').config()

const typeDefs = readFileSync('./typeDefs.graphql', 'UTF-8')

async function start() {
  const app = express()
  const MONGO_DB = process.env.DB_HOST
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
    context: async ({ req }) => {
      const githubToken = req.headers.authorization
      const currentUser = await db.collection('users').findOne({ githubToken })
      return { db, currentUser }
    }
  })

  server.applyMiddleware({ app })

  app.get('/playgournd', expressPlayground({ endpoint: '/graphql'}))
  
  app.get('/', (req, res) => {
    const url = `https://github.com/login/oauth/authorize?client_id=${process.env.CLIENT_ID}&scope=user`
    res.end(`<a href="${url}">Sign In with Github</a>`)
  })

  app.listen(process.env.PORT, () => console.log(`GraphQL Server is running at ${process.env.HOST}:${process.env.PORT}${server.graphqlPath}`))
}

start()