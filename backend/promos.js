const express = require('express')
const router = express.Router()
const supabase = require('./supabase')

// GET all promos
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('promo_codes')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) throw error
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST create promo
router.post('/', async (req, res) => {
    const { code, discount_type, discount_value, valid_from, valid_until, max_uses } = req.body
    try {
        const { data, error } = await supabase
            .from('promo_codes')
            .insert([{ code, discount_type, discount_value, valid_from, valid_until, max_uses }])
            .select()
        if (error) throw error
        res.json(data[0])
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

// PATCH update promo (toggle active, etc)
router.patch('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('promo_codes')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
        if (error) throw error
        res.json(data[0])
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

// DELETE promo
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('promo_codes')
            .delete()
            .eq('id', req.params.id)
        if (error) throw error
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST validate code (for customers applying it)
router.post('/validate', async (req, res) => {
    const { code } = req.body
    try {
        const { data, error } = await supabase
            .from('promo_codes')
            .select('*')
            .eq('code', code.toUpperCase())
            .eq('active', true)
            .single()

        if (error || !data) return res.status(404).json({ error: 'Invalid code' })

        const now = new Date().toISOString().split('T')[0]
        if (data.valid_from && now < data.valid_from) return res.status(400).json({ error: 'Code not yet active' })
        if (data.valid_until && now > data.valid_until) return res.status(400).json({ error: 'Code has expired' })
        if (data.max_uses && data.times_used >= data.max_uses) return res.status(400).json({ error: 'Code has reached usage limit' })

        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router