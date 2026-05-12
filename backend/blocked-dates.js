const express = require('express')
const router = express.Router()
const supabase = require('./supabase')

router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('blocked_dates')
            .select('*')
            .order('start_date', { ascending: true })
        if (error) throw error
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/', async (req, res) => {
    const { van_id, start_date, end_date, reason } = req.body
    try {
        const { data, error } = await supabase
            .from('blocked_dates')
            .insert([{ van_id, start_date, end_date, reason }])
            .select()
        if (error) throw error
        res.json(data[0])
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('blocked_dates')
            .delete()
            .eq('id', req.params.id)
        if (error) throw error
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router