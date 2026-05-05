const express = require('express')
const router = express.Router()
const supabase = require('./supabase')

//Pricing table
const PRICING = {
    vans: {
        johnny: 142,
        eddie: 152,
        chevy: 137
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
function calculatePrice(van_id, nights, addons) {
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

    return {
        base_price,
        discount,
        discount_label,
        basic_insurance,
        collision_insurance,
        insurance_total,
        addons_total,
        subtotal,
        gst,
        pst,
        rv_tax,
        tax_total,
        damage_deposit,
        deposit_amount,
        total_price: total_before_deposit + damage_deposit
    }
}

// GET - check van availability
router.get('/availability/:van_id', async (req, res) => {
    const { van_id } = req.params
    const { start_date, end_date } = req.query

    try {
        const { data, error } = await supabase
            .from('bookings')
            .select('start_date, end_date')
            .eq('van_id', van_id.toLowerCase())
            .neq('status', 'cancelled')
            .lt('start_date', end_date)
            .gt('end_date', start_date)

        if (error) throw error

        const available = data.length === 0

        res.json({ available, conflicts: data })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

//POST - calculate  price before booking
router.post('/calculate', (req, res) => {
    const { van_id, start_date, end_date, addons = {} } = req.body

    try {
        const start = new Date(start_date)
        const end = new Date(end_date)
        const nights = Math.round((end - start) / (1000 * 60 * 60 * 24))

        const pricing = calculatePrice(van_id, nights, addons)

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
router.post('/', async (req, res) => {
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
        const pricing = calculatePrice(van_id, nights, addons)

        //Check availability

        const { data: conflicts, error: availError } = await supabase
            .from('bookings')
            .select('id')
            .eq('van_id', van_id.toLowerCase())
            .neq('status', 'cancelled')
            .or(`start_date.lte.${end_date},end_date.gte.${start_date}`)

        if (availError) throw availError
        if (conflicts.length > 0) throw new Error('Van is not available for these dates')

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
                ...addons,
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

module.exports = router