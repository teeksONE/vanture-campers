const express = require('express')
const cors = require('cors')
require('dotenv').config()

const bookingsRouter = require('./bookings')
const paymentsRouter = require('./payments')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())

// Webhook needs raw body - must be before express.json()
app.use('/payments/webhook', express.raw({ type: 'application/json' }))

app.use(express.json())

// Routes
app.use('/bookings', bookingsRouter)
app.use('/payments', paymentsRouter)

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'Vanture Campers backend is running' })
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})