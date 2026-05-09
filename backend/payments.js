const express = require('express')
const router = express.Router()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const supabase = require('./supabase')

// POST - create payment intent (initiates the payment)
router.post('/create-payment-intent', async (req, res) => {
    const { booking_id } = req.body

    try {
        // Get booking from database
        const { data: booking, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', booking_id)
            .single()

        if (error) throw error
        if (!booking) throw new Error('Booking not found')

        // Create payment intent for deposit amount
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(booking.deposit_amount * 100), // Stripe uses cents
            currency: 'cad',
            metadata: {
                booking_id: booking.id,
                customer_email: booking.customer_email,
                van_id: booking.van_id,
                start_date: booking.start_date,
                end_date: booking.end_date
            }
        })

        // Update booking with stripe payment intent id
        await supabase
            .from('bookings')
            .update({ stripe_payment_id: paymentIntent.id })
            .eq('id', booking_id)

        res.json({
            client_secret: paymentIntent.client_secret,
            deposit_amount: booking.deposit_amount,
            total_price: booking.total_price
        })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

// POST - confirm payment was successful (Stripe webhook)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature']
    let event

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        )
    } catch (err) {
        return res.status(400).json({ error: `Webhook error: ${err.message}` })
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object
        const booking_id = paymentIntent.metadata.booking_id

        // Update booking status
        const { data: booking, error } = await supabase
            .from('bookings')
            .update({ status: 'confirmed' })
            .eq('id', booking_id)
            .select()
            .single()

        if (!error && booking) {
            try {
                const { sendBookingConfirmation } = require('./email')
                await sendBookingConfirmation(booking)
                console.log(`Booking ${booking_id} confirmed and email sent`)
            } catch (e) {
                console.error('Email send failed:', e)
            }
        }
    }

    res.json({ received: true })
})

module.exports = router