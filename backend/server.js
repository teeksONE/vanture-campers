const express = require('express')
const cors = require('cors')
require('dotenv').config()

const bookingsRouter = require('./bookings')
const paymentsRouter = require('./payments')
const promosRouter = require('./promos')
const blockedDatesRouter = require('./blocked-dates')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())

// Public config — frontend asks backend for safe-to-expose keys
app.get('/config', (req, res) => {
    res.json({
        stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY,
        supabase_url: process.env.SUPABASE_URL,
        supabase_anon_key: process.env.SUPABASE_ANON_KEY
    })
})

// Webhook needs raw body - must be before express.json()
app.use('/payments/webhook', express.raw({ type: 'application/json' }))

app.use(express.json())

// Routes
app.use('/bookings', bookingsRouter)
app.use('/payments', paymentsRouter)
app.use('/promos', promosRouter)
app.use('/blocked-dates', blockedDatesRouter)

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'Vanture Campers backend is running' })
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})