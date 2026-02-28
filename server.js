import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productsRoutes.js';
import cartRoutes from './routes/cart.js';
import addressRoutes from './routes/address.js';
import orderRoutes from './routes/order.js';
import liveChatRoutes from './routes/liveChat.js';
import contactRoutes from './routes/contact.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/address', addressRoutes);
app.use('/api/order',orderRoutes )
app.use('/api/live-chat', liveChatRoutes);
app.use('/api/contact', contactRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use((err, _req, res, _next) => {
    console.error("Unhandled server error:", err);
    res.status(500).json({ message: err.message || "Server Error" });
});

connectDB();

app.listen(5001, () => {
    console.log('Server is running on port 5001');
});
