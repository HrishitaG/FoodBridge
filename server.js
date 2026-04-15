const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const { sequelize, connectDB } = require('./db');
const { User, Listing, Order } = require('./models');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 5000;

// Connect to SQLite and sync models
connectDB().then(() => {
    sequelize.sync().then(() => {
        console.log('✅ SQLite database models synchronized.');
    });
});

// Email Transporter (Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Utility: Send Email
const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: `"Food Bridge" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log(`📧 Email sent to ${to}`);
    } catch (error) {
        console.error('Email send failed:', error.message);
    }
};

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password, phone, role, location } = req.body;
    try {
        // Check if user already exists
        const existing = await User.findOne({ where: { email } });
        if (existing) return res.status(400).json({ error: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            name, email, password: hashedPassword, phone, role, location
        });

        // Send verification email
        await sendEmail(email, 'Welcome to Food Bridge!',
            `<h1>Hello ${name}!</h1>
             <p>Thanks for joining Food Bridge as a <b>${role}</b>.</p>
             <p>Click below to verify your email:</p>
             <a href="http://localhost:${PORT}/api/auth/verify?id=${user.id}" 
                style="display:inline-block;padding:12px 24px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
                Verify My Email
             </a>
             <p style="margin-top:16px;color:#888;font-size:12px">If you didn't create this account, ignore this email.</p>`
        );

        res.status(201).json({ message: 'User created successfully. Please check your email to verify.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                location: user.location,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/verify', async (req, res) => {
    const { id } = req.query;
    try {
        await User.update({ isVerified: true }, { where: { id } });
        res.send(`
            <div style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0fff4;min-height:100vh">
                <div style="max-width:480px;margin:0 auto;background:white;padding:48px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
                    <div style="font-size:64px;margin-bottom:16px">✅</div>
                    <h1 style="color:#2d6a4f;font-family:Georgia,serif;margin-bottom:12px">Email Verified!</h1>
                    <p style="color:#666;margin-bottom:32px">Your account has been successfully verified. You can now log in and access all features of Food Bridge.</p>
                    <a href="http://localhost:${PORT}" style="display:inline-block;padding:14px 32px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Go to Food Bridge ↗</a>
                </div>
            </div>
        `);
    } catch (error) {
        res.status(500).send('Verification failed.');
    }
});

// ============================================================
// LISTING ROUTES
// ============================================================

app.get('/api/listings', async (req, res) => {
    try {
        const listings = await Listing.findAll({ where: { status: 'active' }, order: [['createdAt', 'DESC']] });
        const mappedListings = listings.map(l => ({ ...l.toJSON(), _id: l.id }));
        res.json(mappedListings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/listings', async (req, res) => {
    const { donorId, name, quantity, price, type, category, location, expiryTime, description, image } = req.body;
    try {
        const listing = await Listing.create({
            donorId, name, quantity, price, type, category, location, expiryTime, description, image
        });
        res.status(201).json({ message: 'Listing created successfully', id: listing.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/listings/:id', async (req, res) => {
    try {
        await Order.destroy({ where: { listingId: req.params.id } });
        await Listing.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Listing deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/listings/:id', async (req, res) => {
    try {
        await Listing.update(req.body, { where: { id: req.params.id } });
        res.json({ message: 'Listing updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ORDER & OTP ROUTES
// ============================================================

app.post('/api/orders', async (req, res) => {
    const { listingId, receiverId, donorId, amount } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
    const otpExpiry = new Date(Date.now() + 5 * 60000); // 5 minutes

    try {
        let order = await Order.findOne({ where: { listingId, receiverId, status: 'pending' } });
        let isExisting = false;
        
        if (order) {
            order.otp = otp;
            order.otpExpiry = otpExpiry;
            await order.save();
            isExisting = true;
        } else {
            // Check if listing is still active
            const listing = await Listing.findByPk(listingId);
            if (!listing || listing.status !== 'active') {
                return res.status(400).json({ error: 'This listing is no longer available.' });
            }

            order = await Order.create({
                listingId, receiverId, donorId, amount, otp, otpExpiry
            });
        }

        // Fetch receiver info for email
        const receiver = await User.findByPk(receiverId);
        const listing = await Listing.findByPk(listingId);

        if (receiver) {
            await sendEmail(receiver.email, 'FoodBridge: Request Sent to Donor',
                `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                    <h2 style="color:#2d6a4f">⏳ Request Pending Donor Approval</h2>
                    <p>Hello <b>${receiver.name}</b>,</p>
                    <p>Your request for <b>${listing.name}</b> has been sent to the donor.</p>
                    <p>We will email you the OTP to complete the pickup once the donor confirms the order.</p>
                </div>`
            );
        }

        if (!isExisting) {
            const donor = await User.findByPk(donorId);
            if (donor) {
                await sendEmail(donor.email, 'FoodBridge: Action Required - New Food Request',
                    `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                        <h2 style="color:#2d6a4f">📬 Food Request Received!</h2>
                        <p><b>Receiver Name:</b> ${receiver ? receiver.name : 'Unknown'}</p>
                        <p><b>Receiver Email:</b> ${receiver ? receiver.email : 'N/A'}</p>
                        <p><b>Contact Details:</b> ${receiver && receiver.phone ? receiver.phone : 'N/A'}</p>
                        <p><b>Requested Food Item:</b> ${listing.name}</p>
                        <p><b>Quantity:</b> ${listing.quantity}</p>
                        <p><b>Pickup Location:</b> ${listing.location}</p>
                        <div style="text-align:center; margin-top:24px;">
                            <a href="http://localhost:${PORT}/api/orders/approve/${order.id}" 
                               style="display:inline-block;padding:14px 28px;background:#E65100;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">
                               ✅ Confirm Order
                            </a>
                        </div>
                    </div>`
                );
            }
        }

        res.status(201).json({ message: 'Order sent to donor for confirmation.', orderId: order.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders/approve/:id', async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id);
        if (!order) return res.status(404).send('Order not found.');
        if (order.status !== 'pending') return res.status(400).send('Order already processed.');

        const otpExpiry = new Date(Date.now() + 24 * 60 * 60000); // 24 hours to pickup
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        order.status = 'approved';
        order.otp = otp;
        order.otpExpiry = otpExpiry;
        await order.save();

        const receiver = await User.findByPk(order.receiverId);
        const listing = await Listing.findByPk(order.listingId);

        if (receiver && listing) {
            await sendEmail(receiver.email, 'FoodBridge: Order Approved! Here is your OTP.',
                `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                    <h2 style="color:#2d6a4f">🎉 Order Approved!</h2>
                    <p>Hello <b>${receiver.name}</b>,</p>
                    <p>The donor has confirmed your request for <b>${listing.name}</b>.</p>
                    <p>Please enter this OTP in the app to complete your pickup:</p>
                    <div style="text-align:center;margin:24px 0;padding:20px;background:#d8f3dc;border-radius:8px">
                        <div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#1b4332">${otp}</div>
                    </div>
                    <p style="color:#888;font-size:13px">⏰ This code expires in <b>24 hours</b>.</p>
                </div>`
            );
        }

        res.send(`
            <div style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#fff8ec;min-height:100vh">
                <div style="max-width:480px;margin:0 auto;background:white;padding:48px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
                    <div style="font-size:64px;margin-bottom:16px">✅</div>
                    <h1 style="color:#E65100;font-family:Georgia,serif;margin-bottom:12px">Order Confirmed!</h1>
                    <p style="color:#666;margin-bottom:32px">The request has been approved. The receiver has been sent the OTP to complete the pickup.</p>
                    <a href="http://localhost:${PORT}" style="display:inline-block;padding:14px 32px;background:#E65100;color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Return to Food Bridge</a>
                </div>
            </div>
        `);
    } catch (error) {
        res.status(500).send('Error approving order: ' + error.message);
    }
});

app.post('/api/orders/verify', async (req, res) => {
    const { orderId, otp } = req.body;
    try {
        const order = await Order.findByPk(orderId);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (order.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
        if (new Date() > new Date(order.otpExpiry)) return res.status(400).json({ error: 'OTP Expired' });

        // Mark order as completed
        order.status = 'completed';
        await order.save();

        // Leave listing active so other portions can be claimed. Donor explicitly marks it done.
        // await Listing.update({ status: 'completed' }, { where: { id: order.listingId } });

        // Notify both parties
        const donor = await User.findByPk(order.donorId);
        const receiver = await User.findByPk(order.receiverId);
        const listing = await Listing.findByPk(order.listingId);

        if (donor) {
            await sendEmail(donor.email, 'FoodBridge: Order Confirmed ✅',
                `<div style="font-family:sans-serif;padding:20px">
                    <h2 style="color:#2d6a4f">✅ Order Confirmed!</h2>
                    <p>The order for <b>"${listing ? listing.name : 'your listing'}"</b> has been verified and confirmed.</p>
                    <p>Please prepare it for pickup/delivery.</p>
                </div>`
            );
        }
        if (receiver) {
            await sendEmail(receiver.email, 'FoodBridge: Order Successful 🎉',
                `<div style="font-family:sans-serif;padding:20px">
                    <h2 style="color:#2d6a4f">🎉 Order Confirmed!</h2>
                    <p>Your order for <b>"${listing ? listing.name : 'food'}"</b> has been confirmed successfully!</p>
                    <p>The donor has been notified.</p>
                </div>`
            );
        }

        res.json({ message: 'Order verified and completed successfully!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// DASHBOARD ROUTES
// ============================================================

app.get('/api/donor/dashboard/:id', async (req, res) => {
    try {
        const listings = await Listing.findAll({ where: { donorId: req.params.id }, order: [['createdAt', 'DESC']] });
        const rawRequests = await Order.findAll({
            where: { donorId: req.params.id },
            include: [
                { model: Listing, as: 'listing', attributes: ['id', 'name', 'category', 'quantity'] },
                { model: User, as: 'receiver', attributes: ['id', 'name', 'email'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Flatten for frontend convenience
        const requests = rawRequests.map(r => ({
            _id: r.id, // mapped ID since frontend might still rely on _id 
            listingId: r.listing?.id,
            receiverId: r.receiver?.id,
            donorId: r.donorId,
            status: r.status,
            amount: r.amount,
            createdAt: r.createdAt,
            foodName: r.listing?.name || 'Unknown',
            category: r.listing?.category || 'other',
            quantity: r.listing?.quantity || '',
            receiverName: r.receiver?.name || 'Unknown',
            receiverEmail: r.receiver?.email || ''
        }));
        
        // Map listings to contain _id for frontend compatibility
        const mappedListings = listings.map(l => ({ ...l.toJSON(), _id: l.id }));
        
        res.json({ listings: mappedListings, requests });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/receiver/dashboard/:id', async (req, res) => {
    try {
        const rawRequests = await Order.findAll({
            where: { receiverId: req.params.id },
            include: [
                { model: Listing, as: 'listing' },
                { model: User, as: 'donor', attributes: ['id', 'name', 'email'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        const requests = rawRequests.map(r => ({
            _id: r.id,
            listingId: r.listing?.id,
            receiverId: r.receiverId,
            donorId: r.donor?.id,
            status: r.status,
            amount: r.amount,
            createdAt: r.createdAt,
            foodName: r.listing?.name || 'Unknown',
            category: r.listing?.category || 'other',
            quantity: r.listing?.quantity || '',
            location: r.listing?.location || '',
            expiryTime: r.listing?.expiryTime,
            type: r.listing?.type || 'free',
            image: r.listing?.image || null,
            donorName: r.donor?.name || 'Unknown',
            donorEmail: r.donor?.email || ''
        }));
        res.json({ requests });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for all non-API routes (SPA fallback)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
