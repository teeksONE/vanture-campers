const express = require('express')
const router = express.Router()
const supabase = require('./supabase')

//Pricing table
const PRICING = {
    vans: {
        johnny: 142,
        chevy: 137,
        eddie: 152
    },
    insurance_per_night: 15,
    damage_deposit: 500,
    unlimited_km_per_night: 7.50,
    bike_rack_per_night: 10,
    vancouver_pickup: 250,
    vancouver_dropoff: 250,
    yvr_pickup: 350,
    yvr_dropoff: 350,
    pet_cleaning: 50,
    minimum_nights: 4,
    deposit_percent: 0.5
}

//Calculating total price
function calculatePrice(van_id, nights, addons) {
    const base_per_night = PRICING.vans[van_id.toLowerCase()]
    if (!base_per_night) throw new Error('Invalid selected')
    if (nights < PRICING.minimum_nights) throw new Error(`Minimum number of nights is ${PRICING.minimum_nights} nights`)
    
    const base_price = base_per_night * nights
    const insurance = PRICING.insurance_per_night * nights

    let addons_total = 0
    if (addons.unlimited_km) addons_total += PRICING.unlimited_km_per_night *  nights
    if (addons.bike_rack) addons_total += PRICING.bike_rack_per_night * nights
    if (addons.vancouver_pickup) addons_total += PRICING.vancouver_pickup
    if (addons.vancouver_dropoff) addons_total += PRICING.vancouver_dropoff
    if (addons.yvr_pickup) addons_total += PRICING.yvr_pickup
    if (addons.yvr_dropoff) addons_total += PRICING.yvr_dropoff
    if (addons.pet_cleaning) addons_total += PRICING.pet_cleaning

    const subtotal = base_price + insurance + addons_total
    const deposit_amount = subtotal * PRICING.deposit_percent
    const total_price = subtotal
    const damage_deposit = PRICING.damage_deposit

    return {
        base_price,
        insurance,
        addons_total,
        subtotal,
        deposit_amount,
        damage_deposit,
        total_price: subtotal + damage_deposit
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