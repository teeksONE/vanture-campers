const PDFDocument = require('pdfkit')

function generateInvoicePDF(booking) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size:'A4', margin: 50 })
        const buffers = []

        doc.on('data', buffers.push.bind(buffers))
        doc.on('end', () => resolve(Buffer.concat(buffers)))
        doc.on('error', reject)

        // Header
        doc.image('./assets/logo.png', 50, 45, { width: 60 })
        doc.fontSize(24).font('Helvetica-Bold').text('Vanture Campers', 120, 50)
        doc.fontSize(10).font('Helvetica').text('Whistler, British Columbia', 120, 80)
        doc.text('vanturecampers@gmail.com', 120)
        doc.moveDown(3)

        // Invoice title
        doc.fontSize(18).font('Helvetica-Bold').text('Booking Confirmation & Invoice', { align: 'left' })
        doc.moveDown(0.5)
        doc.fontSize(10).font('Helvetica')
        doc.text(`Invoice #: ${booking.id.slice(0, 8).toUpperCase()}`)
        doc.text(`Date: ${new Date(booking.created_at).toLocaleDateString('en-CA')}`)
        doc.moveDown(1.5)

        // Customer details
        doc.fontSize(12).font('Helvetica-Bold').text('Customer:')
        doc.fontSize(10).font('Helvetica')
        doc.text(booking.customer_name)
        doc.text(booking.customer_email)
        doc.text(booking.customer_phone)
        doc.moveDown(1.5)

        // Booking details
        doc.fontSize(12).font('Helvetica-Bold').text('Booking Details:')
        doc.fontSize(10).font('Helvetica')
        const vanName = { johnny: 'Johnny Savana', eddie: 'Eddie Van Halen', chevy: 'Chevy Chase' }[booking.van_id]
        doc.text(`Van: ${vanName}`)
        doc.text(`Pick-up: ${new Date(booking.start_date).toLocaleDateString('en-CA', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}`)
        doc.text(`Drop-off: ${new Date(booking.end_date).toLocaleDateString('en-CA', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}`)
        doc.text(`Nights: ${booking.nights}`)
        doc.moveDown(1.5)

        // Pricing breakdown
        doc.fontSize(12).font('Helvetica-Bold').text('Price Breakdown:')
        doc.moveDown(0.5)

        const lineItem = (label, amount) => {
            doc.fontSize(10).font('Helvetica')
            const yPos = doc.y
            doc.text(label, 50, yPos)
            doc.text(`$${parseFloat(amount).toFixed(2)} CAD`, 400, yPos, { align: 'right', width: 145 })
            doc.moveDown(0.3)
        }

        lineItem('Base price', booking.base_price)
        lineItem('Basic insurance', booking.basic_insurance || (booking.insurance - (booking.collision_insurance || 0)))
        if (booking.collision_insurance > 0) lineItem('Collision & comprehensive', booking.collision_insurance)
        if (booking.addons_total > 0) lineItem('Add-ons', booking.addons_total)
        
        doc.moveDown(0.3)
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
        doc.moveDown(0.3)
        
        lineItem('Subtotal', booking.subtotal)
        if (booking.gst) lineItem('GST (5%)', booking.gst)
        if (booking.pst) lineItem('PST (7%)', booking.pst)
        if (booking.rv_tax) lineItem('Rental Vehicle Tax (2.5%)', booking.rv_tax)
        lineItem('Damage deposit (refundable)', booking.damage_deposit)
        
        doc.moveDown(0.3)
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
        doc.moveDown(0.3)

        doc.fontSize(12).font('Helvetica-Bold')
        const totalY = doc.y
        doc.text('Total', 50, totalY)
        doc.text(`$${parseFloat(booking.total_price).toFixed(2)} CAD`, 400, totalY, { align: 'right', width: 145 })
        doc.moveDown(0.5)
        
        const depositY = doc.y
        doc.fillColor('#2d7a4f')
        doc.text('Deposit paid today (50%)', 50, depositY)
        doc.text(`$${parseFloat(booking.deposit_amount).toFixed(2)} CAD`, 400, depositY, { align: 'right', width: 145 })
        doc.fillColor('black')
        doc.moveDown(0.5)
        
        const balanceY = doc.y
        const balance = booking.total_price - booking.deposit_amount
        doc.text('Balance due at pickup', 50, balanceY)
        doc.text(`$${balance.toFixed(2)} CAD`, 400, balanceY, { align: 'right', width: 145 })
        doc.moveDown(2)

        // Footer
        doc.fontSize(9).font('Helvetica').fillColor('#666')
        doc.text('Thank you for booking with Vanture Campers.', { align: 'center' })
        doc.text('Pickup is from 3:00 PM. Drop-off by 12:00 PM.', { align: 'center' })
        doc.text('Pickup location Whistler, Creekside or Day Lot 4. To be confirmed.', { align: 'center'}) 
        doc.text('Questions? vanturecampers@gmail.com', { align: 'center' })

        doc.end()
    })
}

module.exports = { generateInvoicePDF }