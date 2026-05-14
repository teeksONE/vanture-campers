const express = require('express')
const router = express.Router()
const supabase = require('./supabase')
const { body, validationResult } = require('express-validator')

//Pricing table
const PRICING = {
    vans: {
        johnny: 140,
        eddie: 150,
        chevy: 135
    },
    insurance_per_night: 15,
    collision_insurance_per_night: 10,
    damage_deposit_basic: 750,
    damage_deposit_with_collision: 500,
    unlimited_km_per_night: 7.50,
    bike_rack_per_night: 10,
    vancouver_pickup: 250,
    vancouver_dropoff: 250,
    yvr_pickup: 350,
    yvr_dropoff: 350,
    pet_cleaning: 100,
    minimum_nights: 4,
    deposit_percent: 0.5
}

//Calculating total price
async function calculatePrice(van_id, nights, addons, promo_code = null) {
    const base_per_night = PRICING.vans[van_id.toLowerCase()]
    if (!base_per_night) throw new Error('Invalid van selected')
    if (nights < PRICING.minimum_nights) throw new Error(`Minimum booking is ${PRICING.minimum_nights} nights`)

// Base rate discount logic
    let charged_nights = nights
    let discount = 0
    let discount_label = null

    if (nights >= 30) {
        const gross = base_per_night * nights
        discount = gross * 0.15
        discount_label = '15% long-stay discount'
    } else if (nights >= 10) {
        discount = base_per_night * 2
        charged_nights = nights - 2
        discount_label = '2 nights free'
    }

    const base_price = base_per_night * nights
    const base_price_charged = nights >= 30
        ? (base_per_night * nights) - discount
        : base_per_night * charged_nights

// Insurance
    const basic_insurance = PRICING.insurance_per_night * nights
    const collision_insurance = addons.collision_insurance ? PRICING.collision_insurance_per_night * nights : 0
    const insurance_total = basic_insurance + collision_insurance

// Damage deposit — dynamic based on insurance selection
    const damage_deposit = addons.collision_insurance
        ? PRICING.damage_deposit_with_collision
        : PRICING.damage_deposit_basic

// Addons
    let addons_total = 0
    if (addons.unlimited_km) addons_total += PRICING.unlimited_km_per_night * nights
    if (addons.bike_rack) addons_total += PRICING.bike_rack_per_night * nights
    if (addons.vancouver_pickup) addons_total += PRICING.vancouver_pickup
    if (addons.vancouver_dropoff) addons_total += PRICING.vancouver_dropoff
    if (addons.yvr_pickup) addons_total += PRICING.yvr_pickup
    if (addons.yvr_dropoff) addons_total += PRICING.yvr_dropoff
    if (addons.pet_cleaning) addons_total += PRICING.pet_cleaning

    const subtotal = base_price_charged + insurance_total + addons_total

// Taxes on subtotal only (not damage deposit)
    const gst = subtotal * 0.05
    const pst = subtotal * 0.07
    const rv_tax = subtotal * 0.025
    const tax_total = gst + pst + rv_tax

    const total_before_deposit = subtotal + tax_total
    const deposit_amount = total_before_deposit * PRICING.deposit_percent

// Promo code logic
    let promo_discount = 0
    let applied_promo_code = null

    if (promo_code) {
        const { data: promo } = await supabase
            .from('promo_codes')
            .select('*')
            .eq('code', promo_code.toUpperCase())
            .eq('active', true)
            .single()

        if (promo) {
            const today = new Date().toISOString().split('T')[0]
            const validNow = (!promo.valid_from || today >= promo.valid_from) &&
                            (!promo.valid_until || today <= promo.valid_until) &&
                            (!promo.max_uses || promo.times_used < promo.max_uses) &&
                            (!promo.min_nights || nights >= promo.min_nights)

            if (validNow) {
                applied_promo_code = promo.code
                if (promo.discount_type === 'percent') {
                    promo_discount = (base_price_charged + insurance_total + addons_total) * (promo.discount_value / 100)
                } else if (promo.discount_type === 'flat') {
                    promo_discount = parseFloat(promo.discount_value)
                } else if (promo.discount_type === 'free_nights') {
                    promo_discount = base_per_night * parseFloat(promo.discount_value)
                }
            }
        }
    }

    const subtotal_after_promo = subtotal - promo_discount
    const gst_new = subtotal_after_promo * 0.05
    const pst_new = subtotal_after_promo * 0.07
    const rv_tax_new = subtotal_after_promo * 0.025
    const tax_total_new = gst_new + pst_new + rv_tax_new

    const deposit_amount_final = (subtotal_after_promo + tax_total_new) * PRICING.deposit_percent

    return {
        base_price,
        discount,
        discount_label,
        basic_insurance,
        collision_insurance,
        insurance_total,
        addons_total,
        subtotal: subtotal_after_promo,
        promo_code: applied_promo_code, promo_discount,
        gst: gst_new,
        pst: pst_new,
        rv_tax: rv_tax_new,
        tax_total: tax_total_new,
        damage_deposit,
        deposit_amount: deposit_amount_final,
        total_price: subtotal_after_promo + tax_total_new + damage_deposit
    }
}

// GET - check van availability
router.get('/availability/:van_id', async (req, res) => {
    const { van_id } = req.params
    const { start_date, end_date } = req.query

    try {
// Check bookings
        const { data: bookings, error: bookErr } = await supabase
            .from('bookings')
            .select('start_date, end_date')
            .eq('van_id', van_id.toLowerCase())
            .neq('status', 'cancelled')
            .lt('start_date', end_date)
            .gt('end_date', start_date)

        if (bookErr) throw bookErr

// Check blocked dates
        const { data: blocked, error: blockErr } = await supabase
            .from('blocked_dates')
            .select('start_date, end_date')
            .eq('van_id', van_id.toLowerCase())
            .lt('start_date', end_date)
            .gt('end_date', start_date)

        if (blockErr) throw blockErr

        const conflicts = [...bookings, ...blocked]
        const available = conflicts.length === 0

        res.json({ available, conflicts })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

//POST - calculate  price before booking
router.post('/calculate', async (req, res) => {
    const { van_id, start_date, end_date, addons = {} } = req.body

    try {
        const start = new Date(start_date)
        const end = new Date(end_date)
        const nights = Math.round((end - start) / (1000 * 60 * 60 * 24))

        const pricing = await calculatePrice(van_id, nights, addons, req.body.promo_code)

        res.json({
            van_id,
            start_date,
            end_date,
            nights,
            ...pricing
        })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

//POST - create a booking
const bookingValidators = [
    body('customer_name').trim().notEmpty().isLength({ max: 100 }).withMessage('Invalid name'),
    body('customer_email').trim().isEmail().normalizeEmail().withMessage('Invalid email'),
    body('customer_phone').trim().notEmpty().isLength({ max: 30 }).withMessage('Invalid phone'),
    body('van_id').isIn(['johnny', 'eddie', 'chevy']).withMessage('Invalid van'),
    body('start_date').isISO8601().withMessage('Invalid start date'),
    body('end_date').isISO8601().withMessage('Invalid end date'),
]

router.post('/', bookingValidators, async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
    }
    const {
        customer_name,
        customer_email,
        customer_phone,
        van_id,
        start_date,
        end_date,
        addons = {}
    } = req.body

    try {
//Calculate nights
        const start = new Date(start_date)
        const end = new Date(end_date)
        const nights = Math.round((end - start) / (1000 * 60 * 60 * 24))

        //Calculate price
        const pricing = await calculatePrice(van_id, nights, addons, req.body.promo_code)

//Check availability
    // Check existing bookings
        const { data: bookingConflicts, error: bookErr } = await supabase
            .from('bookings')
            .select('id')
            .eq('van_id', van_id.toLowerCase())
            .neq('status', 'cancelled')
            .lt('start_date', end_date)
            .gt('end_date', start_date)
            if (bookErr) throw bookErr

// Check blocked dates
        const { data: blockedConflicts, error: blockErr } = await supabase
            .from('blocked_dates')
            .select('id')
            .eq('van_id', van_id.toLowerCase())
            .lt('start_date', end_date)
            .gt('end_date', start_date)
        if (blockErr) throw blockErr

        if (bookingConflicts.length > 0 || blockedConflicts.length > 0) {
        throw new Error('Van is not available for these dates')
        }

//Save booking
        const { data, error } = await supabase 
            .from('bookings')
            .insert([{
                customer_name,
                customer_email,
                customer_phone,
                van_id: van_id.toLowerCase(),
                start_date,
                end_date,
                nights,
                ...pricing,
                collision_insurance_selected: addons.collision_insurance || false,
                unlimited_km: addons.unlimited_km || false,
                bike_rack: addons.bike_rack || false,
                vancouver_pickup: addons.vancouver_pickup || false,
                vancouver_dropoff: addons.vancouver_dropoff || false,
                yvr_pickup: addons.yvr_pickup || false,
                yvr_dropoff: addons.yvr_dropoff || false,
                pet_cleaning: addons.pet_cleaning || false,
                status: 'pending'
            }])
            .select()

        if (error) throw error

        res.json({
            message: 'Booking created succesfully',
            booking: data[0]
        })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

//GET - all bookings (admin)
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .order('start_date', { ascending: true })

        if (error) throw error
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

//GET - booked dates for a van
router.get('/booked-dates/:van_id', async (req, res) => {
    const { van_id } = req.params

    try {
        const { data, error } = await supabase
        .from('bookings')
        .select('start_date, end_date')
        .eq('van_id', van_id.toLowerCase())
        .neq('status', 'cancelled')

        if (error) throw error
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.patch('/:id/status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .update({ status: req.body.status })
            .eq('id', req.params.id)
            .select()
        if (error) throw error
        res.json(data[0])
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

module.exports = router