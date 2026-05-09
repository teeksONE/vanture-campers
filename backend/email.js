const { Resend } = require('resend')
const { generateInvoicePDF } = require('./invoice')

const resend = new Resend(process.nextTick.RESEND_API_KEY)

async function sendBookingConfirmation(booking) {
    const pdf = await generateInvoicePDF(booking)
    const vanName = { johnny: 'Johnny Savana', eddie: 'Eddie Van Halen', chevy: 'Chevy Chase' }[booking.van_id]
    const startDate = new Date(booking.start_date).toLocaleDateString('en-CA', {weekday:'long',year:'numeric',month:'long',day:'numeric'})
    const endDate = new Date(booking.end_date).toLocaleDateString('en-CA', {weekday:'long',year:'numeric',month:'long',day:'numeric'})

    // Customer email
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: booking.customer_email,
        subject: `Vanture Campers — Booking confirmed for ${vanName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #233a31;">
                <h1 style="color: #233a31;">Booking confirmed!</h1>
                <p>Hi ${booking.customer_name},</p>
                <p>Thank you for booking with Vanture Campers. Here are your trip details:</p>
                
                <div style="background: #f8f6f1; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Van:</strong> ${vanName}</p>
                    <p><strong>Pick-up:</strong> ${startDate}</p>
                    <p><strong>Drop-off:</strong> ${endDate}</p>
                    <p><strong>Nights:</strong> ${booking.nights}</p>
                    <p><strong>Total:</strong> $${parseFloat(booking.total_price).toFixed(2)} CAD</p>
                    <p><strong>Deposit paid:</strong> $${parseFloat(booking.deposit_amount).toFixed(2)} CAD</p>
                    <p><strong>Balance due at pickup:</strong> $${(booking.total_price - booking.deposit_amount).toFixed(2)} CAD</p>
                </div>
                
                <p>Your full invoice is attached.</p>
                <p>Pickup is from 3:00 PM at the agreed location. We'll be in touch closer to your pickup date with final details.</p>
                <p>Questions? Just reply to this email.</p>
                <p>— Tim, Vanture Campers</p>
            </div>
        `,
        attachments: [{
            filename: `vanture-campers-invoice-${booking.id.slice(0, 8)}.pdf`,
            content: pdf
        }]
    })

    // Admin email
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: process.env.ADMIN_EMAIL,
        subject: `New booking: ${vanName} — ${booking.customer_name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>New booking received</h2>
                <p><strong>Customer:</strong> ${booking.customer_name}</p>
                <p><strong>Email:</strong> ${booking.customer_email}</p>
                <p><strong>Phone:</strong> ${booking.customer_phone}</p>
                <hr>
                <p><strong>Van:</strong> ${vanName}</p>
                <p><strong>Pick-up:</strong> ${startDate}</p>
                <p><strong>Drop-off:</strong> ${endDate}</p>
                <p><strong>Nights:</strong> ${booking.nights}</p>
                <p><strong>Total:</strong> $${parseFloat(booking.total_price).toFixed(2)} CAD</p>
                <p><strong>Deposit:</strong> $${parseFloat(booking.deposit_amount).toFixed(2)} CAD</p>
                <p>Invoice attached.</p>
            </div>
        `,
        attachments: [{
            filename: `invoice-${booking.id.slice(0, 8)}.pdf`,
            content: pdf
        }]
    })
}

module.exports = { sendBookingConfirmation }
