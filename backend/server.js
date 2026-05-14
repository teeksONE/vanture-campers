const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const bookingsRouter = require('./bookings')
const paymentsRouter = require('./payments')
const promosRouter = require('./promos')
const blockedDatesRouter = require('./blocked-dates')

const app = express()
const PORT = process.env.PORT || 3000

// Security headers
app.use(helmet({
    contentSecurityPolicy: false  // disabled for local dev, enable in production
}))

// Middleware
app.use(cors())

// Webhook needs raw body - must be before express.json()
app.use('/payments/webhook', express.raw({ type: 'application/json' }))

app.use(express.json({ limit: '10kb' }))  // limit body size to prevent DoS

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                  // 100 requests per window per IP
    message: { error: 'Too many requests, please try again later' }
})

const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 10,                   // max 10 bookings per hour per IP
    message: { error: 'Too many booking attempts, please try again later' }
})

app.use(generalLimiter)
app.use('/bookings', bookingLimiter)

// Public config — frontend asks backend for safe-to-expose keys
app.get('/config', (req, res) => {
    res.json({
        stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY,
        supabase_url: process.env.SUPABASE_URL,
        supabase_anon_key: process.env.SUPABASE_ANON_KEY
    })
})

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