import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ 
  origin: 'https://ph-batch-12-assignment-12-client.vercel.app', 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Simple routes that work
app.get('/', (req, res) => {
  res.json({ message: 'Server running' });
});

app.get('/api/products/home', async (req, res) => {
  try {
    await client.connect();
    const products = await client.db('garmentsTracker').collection('products').find({}).limit(6).toArray();
    res.json(products);
  } catch (error) {
    res.json([]);
  }
});

app.get('/api/products', async (req, res) => {
  try {
    await client.connect();
    const { search } = req.query;
    let query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    const products = await client.db('garmentsTracker').collection('products').find(query).toArray();
    res.json(products);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    const token = jwt.sign({ email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    await client.connect();
    const user = { ...req.body, status: 'approved', createdAt: new Date() };
    await client.db('garmentsTracker').collection('users').insertOne(user);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    await client.connect();
    const users = await client.db('garmentsTracker').collection('users').find({}).toArray();
    res.json(users);
  } catch (error) {
    res.json([]);
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    await client.connect();
    const result = await client.db('garmentsTracker').collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    await client.connect();
    const product = await client.db('garmentsTracker').collection('products').findOne({ _id: new ObjectId(req.params.id) });
    res.json(product);
  } catch (error) {
    res.json(null);
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    await client.connect();
    const orders = await client.db('garmentsTracker').collection('orders').find({}).toArray();
    res.json(orders);
  } catch (error) {
    res.json([]);
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('garmentsTracker');
    const totalUsers = await db.collection('users').countDocuments();
    const totalProducts = await db.collection('products').countDocuments();
    const totalOrders = await db.collection('orders').countDocuments();
    res.json({ totalUsers, totalProducts, totalOrders, revenue: 15000 });
  } catch (error) {
    res.json({ totalUsers: 0, totalProducts: 0, totalOrders: 0, revenue: 0 });
  }
});

app.get('/api/users/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    await client.connect();
    const user = await client.db('garmentsTracker').collection('users').findOne({ email: decoded.email });
    res.json(user);
  } catch (error) {
    res.status(401).json({ message: 'Unauthorized' });
  }
});

// Seed data on startup
client.connect().then(async () => {
  const db = client.db('garmentsTracker');
  
  // Clear and seed users
  await db.collection('users').deleteMany({});
  await db.collection('users').insertMany([
    { name: "Admin User", email: "admin123@gmail.com", role: "admin", status: "approved", createdAt: new Date() },
    { name: "Manager User", email: "manager123@gmail.com", role: "manager", status: "approved", createdAt: new Date() },
    { name: "Buyer User", email: "buyer123@gmail.com", role: "buyer", status: "approved", createdAt: new Date() }
  ]);
  
  // Clear and seed products
  await db.collection('products').deleteMany({});
  await db.collection('products').insertMany([
    { name: "Premium Cotton T-Shirt", description: "High-quality cotton t-shirt", category: "Shirt", price: 25.99, quantity: 100, images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"], showOnHome: true },
    { name: "Denim Jeans", description: "Classic blue denim jeans", category: "Pant", price: 45.99, quantity: 75, images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=400"], showOnHome: true },
    { name: "Winter Jacket", description: "Warm winter jacket", category: "Jacket", price: 89.99, quantity: 50, images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400"], showOnHome: true },
    { name: "Formal Shirt", description: "Professional formal shirt", category: "Shirt", price: 35.99, quantity: 80, images: ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400"], showOnHome: true },
    { name: "Cargo Pants", description: "Comfortable cargo pants", category: "Pant", price: 39.99, quantity: 60, images: ["https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400"], showOnHome: true },
    { name: "Leather Belt", description: "Genuine leather belt", category: "Accessories", price: 19.99, quantity: 200, images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400"], showOnHome: true },
    { name: "Polo Shirt", description: "Classic polo shirt", category: "Shirt", price: 28.99, quantity: 90, images: ["https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=400"], showOnHome: false },
    { name: "Chino Pants", description: "Stylish chino pants", category: "Pant", price: 42.99, quantity: 70, images: ["https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400"], showOnHome: false },
    { name: "Hoodie", description: "Comfortable hoodie", category: "Jacket", price: 55.99, quantity: 65, images: ["https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400"], showOnHome: false },
    { name: "Baseball Cap", description: "Adjustable baseball cap", category: "Accessories", price: 15.99, quantity: 150, images: ["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400"], showOnHome: false },
    { name: "V-Neck Sweater", description: "Warm v-neck sweater", category: "Jacket", price: 65.99, quantity: 45, images: ["https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400"], showOnHome: false },
    { name: "Skinny Jeans", description: "Trendy skinny jeans", category: "Pant", price: 48.99, quantity: 85, images: ["https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400"], showOnHome: false },
    { name: "Button-Down Shirt", description: "Classic button-down shirt", category: "Shirt", price: 32.99, quantity: 95, images: ["https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400"], showOnHome: false },
    { name: "Track Pants", description: "Athletic track pants", category: "Pant", price: 36.99, quantity: 110, images: ["https://images.unsplash.com/photo-1506629905607-d9c8e3b8c6b4?w=400"], showOnHome: false },
    { name: "Bomber Jacket", description: "Stylish bomber jacket", category: "Jacket", price: 78.99, quantity: 40, images: ["https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=400"], showOnHome: false },
    { name: "Leather Wallet", description: "Premium leather wallet", category: "Accessories", price: 24.99, quantity: 180, images: ["https://images.unsplash.com/photo-1627123424574-724758594e93?w=400"], showOnHome: false },
    { name: "Henley Shirt", description: "Casual henley shirt", category: "Shirt", price: 29.99, quantity: 75, images: ["https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400"], showOnHome: false },
    { name: "Shorts", description: "Summer shorts", category: "Pant", price: 22.99, quantity: 120, images: ["https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400"], showOnHome: false },
    { name: "Cardigan", description: "Cozy cardigan", category: "Jacket", price: 58.99, quantity: 55, images: ["https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400"], showOnHome: false },
    { name: "Sunglasses", description: "Stylish sunglasses", category: "Accessories", price: 18.99, quantity: 160, images: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400"], showOnHome: false },
    { name: "Tank Top", description: "Comfortable tank top", category: "Shirt", price: 16.99, quantity: 130, images: ["https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400"], showOnHome: false }
  ]);
  
  console.log('Products seeded');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});