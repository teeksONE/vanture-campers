const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

//Test route
app.get('/', (req, res) => {
    res.json({ message: 'Vanture Campers backend is running' })
})

//Starting server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

